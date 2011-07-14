

var sqlite = require('sqlite');
var outbound = require('./outbound');
var utils = require('./utils');

var db = new sqlite.Database();

// CREATE TABLE User (
//   id INTEGER PRIMARY KEY,
//   email TEXT NOT NULL,
//   confirmed INTEGER NOT NULL DEFAULT 0,
//   name TEXT,
//   passwd_hash TEXT,
//   key TEXT,
//   bounce_count INTEGER NOT NULL DEFAULT 0
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

var commands = [
    'sub',
    'subscribe',
    'unsub',
    'unsubscribe',
    'bounce',
    'bouncev',
];

var list_re = new RegExp('^(\\w+)(?:-(' + commands.join('|') + ')(?:-(\\w+))?)?$');

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
    this.logdebug("Checking if " + recip + " is a mailing list");
    var matches = list_re.exec(recip.user);
    if (!matches) return next();

    var listname = matches[1];
    var command  = matches[2];
    var key      = matches[3];

    this.logdebug("Looking up <" + listname + "> with command: " + command);

    var domain = recip.host;
    var plugin = this;
    db.execute("SELECT id, email, name FROM List WHERE email = ?", [listname + '@' + domain],
        function (err, rows) {
            if (err) {
                plugin.logerror("DB Error: " + err);
                // nothing we can do here but re-add the email and hope it gets
                // delivered somewhere?
                return next(recip);
            }
            if (rows.length) {
                // can only be one due to index
                plugin.loginfo("Found the list: " + rows[0].email);
                plugin.found_list(next, conn, recip, listname, command, key, rows[0].id, rows[0].email, rows[0].name);
            }
            else {
                // we didn't find the list, so just re-add the recipient and carry on.
                plugin.loginfo("Not a list we know about");
                return next(recip);
            }
        }
    );
}

exports.found_list = function (next, conn, recip, listname, command, key, list_id, list_email, list_name) {
    var plugin = this;
    if (command) {
        switch(command) {
            case 'subscribe':
            case 'sub':
                return process.nextTick(function () {
                    plugin.list_subscribe(next, conn, recip, key, list_id, list_email, list_name)
                });
            case 'unsubscribe':
            case 'unsub':
                return process.nextTick(function () {
                    plugin.list_unsub(next, conn, recip, list_id, list_email, list_name)
                });
            case 'bouncev':
                return process.nextTick(function () {
                    plugin.list_bouncev(next, conn, recip, key, list_id, list_email, list_name)
                })
            case 'bounce':
                return process.nextTick(function () {
                    plugin.list_bounce(next, conn, recip, key, list_id, list_email, list_name)
                });
            default:
                plugin.logerror("No such list command: " + command + " for list: " + list_email);
                return next(recip)
        }
    }
    this.send_list_mail(next, conn, recip, listname, list_id, list_email, list_name);
}

exports.should_moderate = function (mail_from, list_id, cb) {
    // TODO: implement
    cb(false);
}

// check should the post be moderated - then send to moderation queue
// if not, send to everyone. But munge Reply-To if required.
exports.send_list_mail = function (next, conn, recip, listname, list_id, list_email, list_name) {
    var plugin = this;
    this.should_moderate(conn.transaction.mail_from, list_id, function (modflag) {
        if (modflag) {
            return plugin.send_to_moderation_queue(next, conn, recip, listname, list_id, list_email, list_name);
        }
        // otherwise send normally
        db.execute("SELECT email, name FROM User, ListMember WHERE user_id = User.id AND list_id = ?",
                    [list_id],
        function (err, rows) {
            if (err) {
                plugin.logerror("Error getting list users: " + err);
                return next();
            }
            // Fixup the email (TODO: we should probably clone the transaction here because we don't want it changed for every RCPT TO)
            conn.transaction.remove_header('List-Unsubscribe');
            conn.transaction.add_header('List-Unsubscribe', list_email.replace('@', '-unsub@'));
            conn.transaction.remove_header('List-ID');
            conn.transaction.add_header('List-ID', list_name + " <" + list_email.replace('@', '.') + ">");
            // TODO: Add other headers here too.

            var contents = conn.transaction.data_lines.join("");

            var num_to_send = rows.length;
            // for each user
            for (var i=0,l=rows.length; i<l; i++) {
                var to = rows[i].email;
                var verp = verp_email(to);

                var from = list_email.replace('@', '-bouncev-' + verp + '@');
                
                var outnext = function (code, msg) {
                    num_to_send--;
                    if (num_to_send === 0) {
                        next();
                    }
                };

                outbound.send_email(from, to, contents, outnext);
            }
        });
    });
}

// bounce for initial subscribe messages
exports.list_bounce = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    db.execute("SELECT id, confirmed, bounce_count FROM User WHERE key = ?", [key], function(err, rows) {
        if (err) {
            plugin.logerror("Error getting user: " + err);
            return next();
        }
        if (rows.length) {
            plugin.process_bounce(next, conn, rows[0], list_id, list_email, list_name)
        }
    })
}

// bounce for normal verp messages
exports.list_bouncev = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    var email = unverp_email(key);
    db.execute("SELECT id, confirmed, bounce_count FROM User WHERE email = ?", [email], function (err, rows) {
        if (err) {
            plugin.logerror("Error getting user: " + err);
            return next();
        }
        if (rows.length) {
            plugin.process_bounce(next, conn, rows[0], list_id, list_email, list_name)
        }
    })
}

var MAX_BOUNCES = 5;

// TODO: We need some way of resetting bounce_count!

// if confirmed = false, delete user, stop.
// increment bounce_count
// if bounce_count == list.max_bounces, send warning, stop.
// if bounce_count > list.max_bounces, delete user, stop.
exports.process_bounce = function (next, conn, user, list_id, list_email, list_name) {
    var plugin = this;
    if (!user.confirmed) {
        return plugin.delete_user(user.id, next);
    }
    // TODO: should really  do this in the DB to ensure consistency
    bounce_count = bounce_count + 1;

    // TODO: make per-list?
    if (bounce_count === MAX_BOUNCES) {
        return plugin.send_bounce_warning(next, conn, user, list_id, list_email, list_name)
    }

    if (bounce_count > MAX_BOUNCES) {
        return plugin.delete_user(user.id, next);
    }
}

exports.list_subscribe = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    if (key) {
        return plugin.list_subscribe_confirm(next, conn, recip, key, list_id, list_email, list_name);
    }
    plugin.logdebug("Looking up User with email: " + conn.transaction.mail_from.address());
    db.execute("SELECT id, confirmed FROM User WHERE email = ?", [conn.transaction.mail_from.address()],
        function (err, rows) {
            if (err) {
                plugin.logerror("DB Error: " + err);
                // another option here is mail the list admin?
                return next(recip);
            }
            if (rows.length) {
                if (rows[0].confirmed) {
                    return process.nextTick(function () {
                        plugin.list_subscribe_add_user(next, rows[0].id, conn, recip, list_id, list_email, list_name);
                    });
                }
                return process.nextTick(function () {
                    plugin.list_subscribe_send_confirm(next, rows[0].id, conn, recip, list_id, list_email, list_name)
                });
            }
            else {
                return process.nextTick(function () {
                    plugin.list_subscribe_new_user(next, conn, recip, list_id, list_email, list_name);
                });
            }
        }
    )
}

exports.list_subscribe_confirm = function (next, conn, recip, key, list_id, list_email, list_name) {
    var plugin = this;
    var found = false;
    plugin.loginfo("Confirming " + conn.transaction.mail_from.address() + " with key: " + key);
    db.execute("SELECT id FROM User WHERE key = ?", [key], function (err, rows) {
        if (err) {
            plugin.logerror("DB Error fetching confirmation key: " + err);
            return next();
        }
        if (!rows.length) {
            // no such key, but just drop the mail.
            plugin.loginfo("No such key in DB, dropping this mail");
            return next();
        }
        var user_id = rows[0].id;
        plugin.loginfo("Got user with id: " + user_id);
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

    plugin.loginfo("Adding user: " + user_id + " to list");
    db.execute("INSERT INTO ListMember (list_id, user_id) VALUES (?, ?)", [list_id, user_id], function (err) {
        if (err) {
            // Could be that they are already a member of the list...
            if (!(/constraint failed/.test(err))) {
                plugin.logerror("DB Error inserting ListMember: " + err);
                return next();
            }
        }
        plugin.send_welcome_email(next, conn, recip, list_id, list_email, list_name);
    })

}

// add email to User table, with confirmed = false
exports.list_subscribe_new_user = function (next, conn, recip, list_id, list_email, list_name) {
    var plugin = this;
    plugin.loginfo("New user: " + conn.transaction.mail_from.address());
    db.execute("INSERT INTO User (email) VALUES (?)", [conn.transaction.mail_from.address()],
    function (err) {
        if (err) {
            plugin.logerror("DB Error: " + err);
            return next(recip);
        }
        // go back to list_subscribe, where we get the User.id and send confirmation email
        return plugin.list_subscribe(next, conn, recip, null, list_id, list_email, list_name);
    })
}

// Send a confirmation email to sign up to a list
// - generate key
// - store in db
// - send mail with Reply-To: list-subscribe-$key@domain
// - mail mail_from = list-bounce-<verpuser>@domain
exports.list_subscribe_send_confirm = function (next, user_id, conn, recip, list_id, list_email, list_name) {
    var plugin = this;

    var key = utils.uuid().replace(/-/g, '');
    db.execute("UPDATE User SET key = ? WHERE id = ?", [key, user_id], function (err) {
        if (err) {
            plugin.logerror("Failed to set user key: " + err);
            return next();
        }

        var to = conn.transaction.mail_from;
        var from = list_email.replace('@', '-bounce-' + key + '@');

        var contents = [
            "From: " + list_email.replace('@', '-help@'),
            "To: " + to,
            "MIME-Version: 1.0",
            "Content-type: text/plain; charset=us-ascii",
            "Reply-To: " + list_email.replace('@', '-sub-' + key + '@'),
            "Subject: Confirm your Subscription to " + list_email,
            "",
            "To confirm that you would like '" + to + "'",
            "added to the " + list_email + " mailing list,",
            "please send an empty reply to this email.",
            "",
            "If that does not work, click here (link to web server)",
            ""].join("\n");
        
        var outnext = function (code, msg) {
            switch (code) {
                case DENY:  plugin.logerror("Sending confirmation mail failed: " + msg);
                            break;
                case OK:    plugin.loginfo("Confirmation mail sent");
                            next();
                            break;
                default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
            }
        };

        outbound.send_email(from, to, contents, outnext);
    });
}

// I need to improve this a bit I'm sure...
function verp_email (email) {
    return email.replace(/@/, '=');
}

function unverp_email (verp) {
    return verp.replace(/=/, '@');
}

exports.send_welcome_email = function (next, conn, recip, list_id, list_email, list_name) {
    var plugin = this;

    var to = conn.transaction.mail_from;

    var verp = verp_email(to.address());

    var from = list_email.replace('@', '-bouncev-' + verp + '@');

    var contents = [
        "From: " + list_email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Welcome to " + list_email,
        "",
        "Welcome '" + to + "' to the " + list_email,
        "mailing list.",
        ""].join("\n");
    
    var outnext = function (code, msg) {
        switch (code) {
            case DENY:  plugin.logerror("Sending welcome mail failed: " + msg);
                        break;
            case OK:    plugin.loginfo("Welcome mail sent");
                        next();
                        break;
            default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
        }
    };

    outbound.send_email(from, to, contents, outnext);
}


exports.list_unsub = function (next, conn, recip, list_id, list_email, list_name) {
}