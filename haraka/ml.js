

var outbound    = require('./outbound');
var utils       = require('./utils');
var lists       = require('/opt/groupalist/list');
var users       = require('/opt/groupalist/user');
var db          = require('/opt/groupalist/db');

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
    db.init();
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

    var plugin = this;
    lists.find_list(listname + '@' + recip.host, function (listinfo) {
        if (list) {
            plugin.loginfo("Found the list: " + listinfo.email);
            plugin.found_list(next, conn, recip, listname, command, key, listinfo);
        }
        else {
            // we didn't find the list, so just re-add the recipient and carry on.
            return next(recip);
        }
    });
}

exports.found_list = function (next, conn, recip, command, key, listinfo) {
    var plugin = this;
    if (command) {
        switch(command) {
            case 'subscribe':
            case 'sub':
                return process.nextTick(function () {
                    plugin.list_subscribe(next, conn, recip, key, listinfo)
                });
            case 'unsubscribe':
            case 'unsub':
                return process.nextTick(function () {
                    plugin.list_unsub(next, conn, recip, listinfo)
                });
            case 'bouncev':
                return process.nextTick(function () {
                    plugin.list_bouncev(next, conn, recip, key, listinfo)
                })
            case 'bounce':
                return process.nextTick(function () {
                    plugin.list_bounce(next, conn, recip, key, listinfo)
                });
            default:
                plugin.logerror("No such list command: " + command + " for list: " + listinfo.email);
                return next(recip)
        }
    }
    this.send_list_mail(next, conn, listinfo);
}

// check should the post be moderated - then send to moderation queue
// if not, send to everyone. But munge Reply-To if required.
exports.send_list_mail = function (next, conn, listinfo) {
    var plugin = this;
    lists.should_moderate(conn.transaction.mail_from, listinfo, function (modflag) {
        if (modflag) {
            return plugin.send_to_moderation_queue(next, conn, listinfo);
        }
        // otherwise send normally
        lists.get_members(listinfo, function (users) {
            if (!users) {
                return next();
            }

            // Fixup the email (TODO: we should probably clone the transaction here because we don't want it changed for every RCPT TO)
            conn.transaction.remove_header('List-Unsubscribe');
            conn.transaction.add_header('List-Unsubscribe', list_email.replace('@', '-unsub@'));
            conn.transaction.remove_header('List-ID');
            conn.transaction.add_header('List-ID', list_name + " <" + list_email.replace('@', '.') + ">");

            // TODO: Add other headers here too.

            var contents = conn.transaction.data_lines.join("");

            var num_to_send = users.length;
            // for each user
            for (var i=0,l=users.length; i<l; i++) {
                var to = users[i].email;
                var verp = verp_email(to);

                var from = listinfo.email.replace('@', '-bouncev-' + verp + '@');
                
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

exports.send_to_moderation_queue = function (next, conn, listinfo) {
    // TODO
}

// bounce for initial subscribe messages
exports.list_bounce = function (next, conn, key, listinfo) {
    var plugin = this;
    users.get_user_by_key(key, function (user) {
        if (!user) {
            return next();
        }
        plugin.process_bounce(next, conn, user, listinfo);
    })
}

// bounce for normal verp messages
exports.list_bouncev = function (next, conn, key, listinfo) {
    var plugin = this;
    var email = unverp_email(key);
    users.get_user_by_email(email, function (user) {
        if (!user) {
            return next();
        }
        plugin.process_bounce(next, conn, user, listinfo);
    })
}

var MAX_BOUNCES = 5;

// TODO: We need some way of resetting bounce_count!

// if confirmed = false, delete user, stop.
// increment bounce_count
// if bounce_count == list.max_bounces, send warning, stop.
// if bounce_count > list.max_bounces, delete user, stop.
exports.process_bounce = function (next, conn, user, listinfo) {
    var plugin = this;
    if (!user.confirmed) {
        return users.delete_user(user.id, next);
    }
    // TODO: should really  do this in the DB to ensure consistency
    bounce_count = bounce_count + 1;

    // TODO: make per-list?
    if (bounce_count === MAX_BOUNCES) {
        return plugin.send_bounce_warning(next, conn, user, listinfo)
    }

    if (bounce_count > MAX_BOUNCES) {
        return users.delete_user(user.id, next);
    }
}

exports.list_subscribe = function (next, conn, recip, key, listinfo) {
    var plugin = this;
    if (key) {
        return plugin.list_subscribe_confirm(next, conn, recip, key, listinfo);
    }
    plugin.logdebug("Looking up User with email: " + conn.transaction.mail_from.address());
    users.get_user_by_email(conn.transaction.mail_from.address(), function (user) {
        if (user) {
            if (user.confirmed) {
                return plugin.list_subscribe_add_user(next, user, conn, recip, listinfo);
            }
            // else
            return plugin.list_subscribe_send_confirm(next, user, conn, recip, listinfo);
        }
        else {
            return plugin.list_subscribe_new_user(next, conn, recip, listinfo);
        }
    })
}

exports.list_subscribe_confirm = function (next, conn, recip, key, listinfo) {
    var plugin = this;
    plugin.loginfo("Confirming " + conn.transaction.mail_from.address() + " with key: " + key);

    users.get_user_by_key(key, function (user) {
        if (!user) {
            return next();
        }
        plugin.loginfo("Got user with id: " + user.id);
        users.confirm_user(user, function (ok) {
            if (!ok) {
                return next();
            }
            return plugin.list_subscribe_add_user(next, user, conn, recip, listinfo);
        })
    })
}

exports.list_subscribe_add_user = function (next, user, conn, recip, listinfo) {
    var plugin = this;

    plugin.loginfo("Adding user: " + user.id + " to list");
    lists.add_member(listinfo.id, user.id, function (ok) {
        if (!ok) {
            return next();
        }
        plugin.send_welcome_email(next, conn, recip, user, listinfo);
    })
}

// add email to User table, with confirmed = false
exports.list_subscribe_new_user = function (next, conn, recip, listinfo) {
    var plugin = this;
    plugin.loginfo("New user: " + conn.transaction.mail_from.address());

    users.create_user(email, function (user) {
        if (!user) {
            return next();
        }
        return plugin.list_subscribe_send_confirm(next, user, conn, recip, listinfo);
    });
}

// Send a confirmation email to sign up to a list
// - generate key
// - store in db
// - send mail with Reply-To: list-subscribe-$key@domain
// - mail mail_from = list-bounce-<verpuser>@domain
exports.list_subscribe_send_confirm = function (next, user, conn, recip, listinfo) {
    var plugin = this;

    var key = utils.uuid().replace(/-/g, '');

    users.set_key(user, key, function (ok) {
        if (!ok) {
            return next();
        }

        var to = conn.transaction.mail_from;
        var from = listinfo.email.replace('@', '-bounce-' + key + '@');

        // TODO: Get the contents of this from the DB for each list
        var contents = [
            "From: " + listinfo.email.replace('@', '-help@'),
            "To: " + to,
            "MIME-Version: 1.0",
            "Content-type: text/plain; charset=UTF-8",
            "Reply-To: " + listinfo.email.replace('@', '-sub-' + key + '@'),
            "Subject: Confirm your Subscription to " + listinfo.email,
            "",
            "To confirm that you would like '" + to + "'",
            "added to the " + listinfo.email + " mailing list,",
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

exports.send_welcome_email = function (next, conn, recip, user, listinfo) {
    var plugin = this;

    var to = conn.transaction.mail_from;

    var verp = verp_email(to.address());

    var from = listinfo.email.replace('@', '-bouncev-' + verp + '@');

    var contents = [
        "From: " + listinfo.email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Welcome to " + listinfo.email,
        "",
        "Welcome '" + to + "' to the " + listinfo.email,
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

// TODO
exports.list_unsub = function (next, conn, recip, listinfo) {
}