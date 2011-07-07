

var sqlite = require('sqlite');
var outbound = require('./outbound');

var db = new sqlite.Database();

// CREATE TABLE User (
//   id INTEGER PRIMARY KEY,
//   email TEXT NOT NULL,
//   confirmed INTEGER NOT NULL DEFAULT 0,
//   name TEXT,
//   passwd_hash TEXT,
//   key TEXT
//   );
// CREATE UNIQUE INDEX User_email ON User (email);

// CREATE TABLE List (
//   id INTEGER PRIMARY KEY,
//   email TEXT NOT NULL,
//   name TEXT
//   );
// CREATE UNIQUE INDEX List_email ON List (email);

// CREATE TABLE ListMember (
//   list_id INTEGER NOT NULL REFERENCES List,
//   user_id INTEGER NOT NULL REFERENCES User
//   );
// CREATE UNIQUE INDEX ListMember_uniq ON ListMember (list_id, user_id);

// CREATE TABLE ListAdmin (
//   list_id INTEGER NOT NULL REFERENCES List,
//   user_id INTEGER NOT NULL REFERENCES User
//   );
// CREATE UNIQUE INDEX ListAdmin_uniq ON ListAdmin (list_id, user_id);

var get_list = 
var commands = [
    'sub',
    'subscribe',
    'unsub',
    'unsubscribe',
];

var list_re = new RegExp('^(\w+)(?:-(' + commands.join('|') + ')(?:-(\w+))?)?$');

exports.register = function () {
    db.open('mailinglist.db', function (err) {
        if (err) {
            throw err;
        }
    });
}

exports.hook_queue = function (next, conn) {
    // copy the recipients and replace with empty list for now
    var rcpts = conn.transaction.rcpt_to;
    conn.transaction.rcpt_to = [];

    var count = rcpts.length;
    var mynext = function (recip) {
        count--;
        if (recip) {
            conn.transaction.rcpt_to.push(recip);
        }
        if (count === 0) {
            if (conn.transaction.rcpt_to.length === 0) {
                // we dealt with all the recipients
                next(OK, "Queued");
            }
            else {
                // there are recipients remaining.
                next();
            }
        }
    }

    var list_rcpts = [];
    for (var i=0,l=rcpts.length; i < l; i++) {
        this.lookup_recipient(mynext, conn, rcpts[i]);
    }
}

exports.lookup_recipient = function (next, conn, recip) {
    var matches = list_re.match(recip.user);
    if (!matches) return next();

    var listname = matches[1];
    var command  = matches[2];
    var key      = matches[3];

    var found = false;

    var domain = recip.host;
    var plugin = this;
    db.query("SELECT id, email, name FROM List WHERE email = ?", [listname + '@' + domain],
        function (err, row) {
            if (err) {
                plugin.logerror("DB Error: " + err);
                // nothing we can do here but re-add the email and hope it gets
                // delivered somewhere?
                return next(recip);
            }
            if (row) {
                // can only be one due to index
                found = true;
                plugin.found_list(next, conn, recip, listname, command, key, row.id, row.email, row.name);
            }
            else {
                // we didn't find the list, so just re-add the recipient and carry on.
                if (!found) {
                    return next(recip);
                }
            }
        }
    );
}

exports.found_list = function (next, conn, recip, listname, command, key, list_id, list_email, list_name) {
    if (command) {
        switch(command) {
            case 'subscribe':
            case 'sub':
                return this.list_subscribe(next, conn, recip, key, list_id, list_email, list_name)
            case 'unsubscribe':
            case 'unsub':
                return this.list_unsub(next, conn, recip, list_id, list_email, list_name)
            default:
                this.logerror("No such list command: " + command + " for list: " + list_email);
                return next(recip)
        }
    }


}

exports.list_subscribe = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    var found = false;
    if (key) {
        return plugin.list_subscribe_confirm(next, conn, recip, key, list_id, list_email, list_name);
    }
    db.query("SELECT id, confirmed FROM User WHERE email = ?", [conn.transaction.mail_from.address],
        function (err, row) {
            if (err) {
                plugin.logerror("DB Error: " + err);
                // another option here is mail the list admin?
                return next(recip);
            }
            if (row) {
                found = true;
                if (row.confirmed) {
                    return plugin.list_subscribe_add_user(next, row.id, conn, recip, list_id, list_email, list_name);
                }
                return plugin.list_subscribe_send_confirm(next, row.id, conn, recip, list_id, list_email, list_name);
            }
            else if (!found) {
                return plugin.list_subscribe_new_user(next, conn, recip, list_id, list_email, list_name);
            }
        }
    )
}

exports.list_subscribe_confirm = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    var found = false;
    db.execute("SELECT id FROM User WHERE key = ?", [key], function (err, rows) {
        if (err) {
            plugin.logerror("DB Error fetching confirmation key: " + err);
            return next();
        }
        if (!rows.length) {
            // no such key, but just drop the mail.
            return next();
        }
        var user_id = rows[0].id;
        db.execute("UPDATE User SET confirmed = 1, key = NULL WHERE id = ?", [user_id], function (err) {
            if (err) {
                plugin.logerror("DB Error updating user: " + err);
                return next();
            }
            return plugin.list_subscribe_add_user(next, user_id, conn, recip, list_id, list_email, list_name);
        })
    })
}

exports.list_subscribe_add_user = function (next, user_id, conn, recip, list_id, list_email, list_name) {
    var plugin = this;

    db.execute("INSERT INTO ListMember (list_id, user_id) VALUES (?, ?)", [list_id, user_id], function (err) {
        if (err) {
            plugin.logerror("DB Error inserting ListMember: " + err);
            return next();
        }
        plugin.send_welcome_email(next, conn, recip, list_id, list_email, list_name);
    })

}

// add email to User table, with confirmed = false
exports.list_subscribe_new_user = function (next, conn, recip, list_id, list_email, list_name) {
    var plugin = this;
    db.query("INSERT INTO User (email) VALUES (?)", [conn.transaction.mail_from.address],
    function (err) {
        if (err) {
            plugin.logerror("DB Error: " + err);
            return next(recip);
        }
        // go back to list_subscribe, where we get the User.id and send confirmation email
        return plugin.list_subscribe(next, conn, recip, list_id, list_email, list_name);
    })
}

exports.list_subscribe_send_confirm = function (next, user_id, conn, recip, list_id, list_email, list_name) {
    var plugin = this;

    
}


exports.list_unsub = function (next, conn, recip, list_id, list_email, list_name) {
}