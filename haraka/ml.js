

var outbound    = require('./outbound');
var utils       = require('./utils');
var lists       = require('/opt/groupalist/list');
var users       = require('/opt/groupalist/user');
var async       = require('async');

var commands = [
    'sub',
    'subscribe',
    'unsub',
    'unsubscribe',
    'bk',
    'bv',
    'bw',
];

var list_re = new RegExp('^(\\w+)(?:-(' + commands.join('|') + ')(?:-([\\w\\-]+))?)?$');

exports.hook_rcpt = function (next, connection, params) {
    var rcpt = params[0];
    this.lookup_list(connection.transaction, rcpt, function (found_recip) {
        if (found_recip) {
            next(OK, "Recipient is a mailing list");
        }
        else {
            next();
        }
    });
}


exports.hook_data = function (next, connection) {
    // enable mail body parsing
    connection.transaction.parse_body = true;
    next();
}

exports.hook_queue = function (next, conn) {
    var plugin = this;
    // copy the recipients and replace with empty list for now
    var trans = conn.transaction;
    var rcpts = trans.rcpt_to;
    trans.rcpt_to = [];

    async.each(rcpts, function (recip, cb) {
        plugin.lookup_recipient(trans, recip, function (found_recip) {
            if (found_recip) {
                trans.rcpt_to.push(found_recip);
            }
            cb();
        });
    }, function (err) {
        if (err) {
            return next(DENY, "Failed: " + err);
        }
        if (trans.rcpt_to.length === 0) {
            return next(OK, "Mailing list mail sent");
        }
        return next(); // go to next queue plugin
    });
}

// Hook for a 5xx error on outbound
exports.hook_bounce = function (next, hmail, err) {
    // if (hmail.todo.mail_from is a list) { process bounce }
    next();
}

exports.lookup_list = function (trans, recip, cb) {
    this.logdebug("Checking if " + recip + " is a mailing list");
    var matches = list_re.exec(recip.user);
    if (!matches) {
        this.logdebug("Doesn't match the format for a list mail");
        return cb();
    }

    var listname = matches[1];
    var command  = matches[2];
    var key      = matches[3];

    this.logdebug("Looking up <" + listname + "> with command: " + command + " from:" + trans.mail_from.address());

    var plugin = this;
    lists.find_list(listname + '@' + recip.host, function (list) {
        if (list) {
            plugin.loginfo("Found the list: " + list.email);
            cb(true)
        }
        else {
            // we didn't find the list, so just re-add the recipient and carry on.
            cb();
        }
    });
}


exports.lookup_recipient = function (trans, recip, next) {
    this.logdebug("Checking if " + recip + " is a mailing list");
    var matches = list_re.exec(recip.user);
    if (!matches) {
        this.logdebug("Doesn't match the format for a list mail");
        return next(recip);
    }

    var listname = matches[1];
    var command  = matches[2];
    var key      = matches[3];

    this.logdebug("Looking up <" + listname + "> with command: " + command + " from:" + trans.mail_from.address());

    var plugin = this;
    lists.find_list(listname + '@' + recip.host, function (list) {
        if (list) {
            plugin.loginfo("Found the list: " + list.email);
            plugin.found_list(next, trans, recip, command, key, list);
        }
        else {
            // we didn't find the list, so just re-add the recipient and carry on.
            return next(recip);
        }
    });
}

exports.found_list = function (next, trans, recip, command, key, list) {
    var plugin = this;
    if (command) {
        switch(command) {
            case 'help':
                return plugin.list_help(next, trans, recip, list);
            case 'subscribe':
            case 'sub':
                return plugin.list_subscribe(next, trans, recip, key, list);
            case 'unsubscribe':
            case 'unsub':
                return plugin.list_unsub(next, trans, recip, list);
            case 'bk':
                return plugin.list_bounce_key(next, trans, recip, key, list);
            case 'bv':
                return plugin.list_bounce_id_verp(next, trans, recip, key, list);
            case 'bw':
                return plugin.list_bounce_verp_only(next, trans, recip, key, list);
            default:
                plugin.logerror("No such list command: " + command + " for list: " + list.email);
                return next(recip)
        }
    }
    this.send_list_mail(next, trans, list);
}

exports.bounce_non_member = function (next, trans, list) {
    var plugin = this;

    var to = trans.mail_from;

    var verp = verp_email(to.address());

    var from = list.email.replace('@', '-bw-' + verp + '@');

    var contents = [
        "From: " + list.email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Emails to " + list.email + " are restricted",
        "",
        "Emails sent to " + list.email + " are restricted to members only.",
        "",
        "To subscribe, send an email to: mailto:" + list.email.replace('@', '-sub@'),
        ""].join("\n");
    
    var outnext = function (code, msg) {
        switch (code) {
            case DENY:  plugin.logerror("Sending bounce mail failed: " + msg);
                        break;
            case OK:    plugin.loginfo("Bounce non-member mail sent");
                        next();
                        break;
            default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
                        next();
        }
    };

    outbound.send_email(from, to, contents, outnext);
}

exports.bounce_rejected = function (next, trans, list) {
    var plugin = this;

    var to = trans.mail_from;

    var verp = verp_email(to.address());

    var from = list.email.replace('@', '-bw-' + verp + '@');

    var contents = [
        "From: " + list.email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Your message to " + list.email + " has been rejected",
        "",
        "Feel free to contact the list administrators at",
        "mailto:" + list.email.replace('@', '-admins@') + " for further details.",
        ""].join("\n");
    
    var outnext = function (code, msg) {
        switch (code) {
            case DENY:  plugin.logerror("Sending bounce mail failed: " + msg);
                        break;
            case OK:    plugin.loginfo("Bounce mail sent");
                        next();
                        break;
            default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
                        next();
        }
    };

    outbound.send_email(from, to, contents, outnext);
}

// check should the post be moderated - then send to moderation queue
// if not, send to everyone. But munge Reply-To if required.
exports.send_list_mail = function (next, trans, list) {
    var plugin = this;
    users.get_user_by_email(trans.mail_from.address(), function (user) {
        if (!user) {
            // No such user at all - TODO: list should allow non-member
            // posts but moderate them...
            return plugin.bounce_non_member(next, trans, list);
        }
        lists.should_moderate(user, list, function (reject, moderate) {
            if (reject) {
                return plugin.bounce_rejected(next, trans, list)
            }
            if (moderate) {
                return plugin.send_to_moderation_queue(next, trans, list);
            }
            // otherwise send normally
            lists.get_members(list, function (users) {
                if (!users) {
                    plugin.logerror("No users for list " + list.email);
                    return next();
                }

                lists.archive_email(list, trans, function (id) {
                    if (!id) {
                        plugin.logerror("Archiving failed");
                        return next();
                    }

                    // Fixup the email (TODO: we should probably clone the transaction here because we don't want it changed for every RCPT TO)
                    trans.remove_header('List-Unsubscribe');
                    trans.add_header('List-Unsubscribe', list.email.replace('@', '-unsub@'));
                    trans.remove_header('List-ID');
                    trans.add_header('List-ID', list.name + " <" + list.email.replace('@', '.') + ">");
                    trans.remove_header('List-Message-Id');
                    trans.add_header('List-Message-Id', id);
                    if (list.reply_to_set) {
                        trans.remove_header('Reply-To');
                        trans.add_header('Reply-To', list.email);
                    }

                    // TODO: Add other headers here too.

                    trans.message_stream.get_data(function (contents) {
                        contents = contents.replace(/\r/g, '');

            // users = [{email: "helpme@gmail.com"}];

                        // for each user
                        async.each(users, function (user, cb) {
                            var to = user.email;
                            var verp = verp_email(to);

                            var from = list.email.replace('@', '-bv-' + id + '-' + verp + '@');

                            plugin.loginfo("Sending " + contents.length + " bytes to " + to);
                            outbound.send_email(from, to, contents, function (code, msg) { cb() });
                        }, function (err) {
                            next();
                        });
                    });
                })
            });
        });
    })
}

exports.send_to_moderation_queue = function (next, trans, list) {
    // TODO
}

// bounce for initial subscribe messages with key
exports.list_bounce_key = function (next, trans, key, list) {
    var plugin = this;
    users.get_user_by_key(key, function (user) {
        if (!user) {
            return next();
        }

        plugin.loginfo("user suffered a bounce on initial subscribe")
        return us
    })
}

// bounce for normal messages with verp and id.
exports.list_bounce_id_verp = function (next, trans, key, list) {
    var plugin = this;
    var matches = key.match(/^(\w+)-(.*)$/);
    if (!matches) {
        // email is in wrong format. Odd!
        this.logerror("Email matching bv is in wrong format");
        return next();
    }

    var msg_id = matches[1];
    var email = unverp_email(matches[2]);
    users.get_user_by_email(email, function (user) {
        if (!user) {
            plugin.logerror("Got bouncev from a non-user. Odd!");
            return next();
        }
        plugin.process_bounce(next, trans, user, msg_id, list);
    })
}

exports.list_bounce_verp = function (next, trans, key, list) {
    
}

exports.list_bounce_verp

var MAX_BOUNCES = 5;

// TODO: We need some way of resetting bounce_count!

// if confirmed = false, delete user, stop.
// increment bounce_count
// if bounce_count == list.max_bounces, send warning, stop.
// if bounce_count > list.max_bounces, delete user, stop.
exports.process_bounce = function (next, trans, user, list) {
    var plugin = this;
    if (!user.confirmed) {
        plugin.loginfo("User was never even confirmed. Deleting him.");
        return users.delete_user(user.id, next);
    }

    users.log_bounce()
    // TODO: should really  do this in the DB to ensure consistency
    bounce_count = bounce_count + 1;

    // TODO: make per-list?
    if (bounce_count === MAX_BOUNCES) {
        return plugin.send_bounce_warning(next, trans, user, list)
    }

    if (bounce_count > MAX_BOUNCES) {
        return users.delete_user(user.id, next);
    }
}

exports.list_subscribe = function (next, trans, recip, key, list) {
    var plugin = this;
    if (key) {
        return plugin.list_subscribe_confirm(next, trans, recip, key, list);
    }
    plugin.logdebug("Looking up User with email: " + trans.mail_from.address());
    users.get_user_by_email(trans.mail_from.address(), function (user) {
        if (user) {
            if (user.confirmed) {
                return plugin.list_subscribe_add_user(next, user, trans, recip, list);
            }
            // else
            return plugin.list_subscribe_send_confirm(next, user, trans, recip, list);
        }
        else {
            return plugin.list_subscribe_new_user(next, trans, recip, list);
        }
    })
}

exports.list_subscribe_confirm = function (next, trans, recip, key, list) {
    var plugin = this;
    plugin.loginfo("Confirming " + trans.mail_from.address() + " with key: " + key);

    users.get_user_by_key(key, function (user) {
        if (!user) {
            return next();
        }
        plugin.loginfo("Got user with id: " + user.id);
        users.confirm_user(user, function (ok) {
            if (!ok) {
                return next();
            }
            return plugin.list_subscribe_add_user(next, user, trans, recip, list);
        })
    })
}

exports.list_subscribe_add_user = function (next, user, trans, recip, list) {
    var plugin = this;

    plugin.loginfo("Adding user: " + user.id + " to list");
    lists.add_member(list.id, user.id, function (ok) {
        if (!ok) {
            return next();
        }
        plugin.send_welcome_email(next, trans, recip, user, list);
    })
}

// add email to User table, with confirmed = false
exports.list_subscribe_new_user = function (next, trans, recip, list) {
    var plugin = this;
    plugin.loginfo("New user: " + trans.mail_from.address());

    users.create_user(trans.mail_from.address(), function (user) {
        if (!user) {
            return next();
        }
        return plugin.list_subscribe_send_confirm(next, user, trans, recip, list);
    });
}

// Send a confirmation email to sign up to a list
// - generate key
// - store in db
// - send mail with Reply-To: list-subscribe-$key@domain
// - mail mail_from = list-bounce-<verpuser>@domain
exports.list_subscribe_send_confirm = function (next, user, trans, recip, list) {
    var plugin = this;

    var key = utils.uuid().replace(/-/g, '');

    users.set_key(user, key, function (ok) {
        if (!ok) {
            return next();
        }

        var to = trans.mail_from;
        var from = list.email.replace('@', '-bk-' + key + '@');

        // TODO: Get the contents of this from the DB for each list
        var contents = [
            "From: " + list.email.replace('@', '-help@'),
            "To: " + to,
            "MIME-Version: 1.0",
            "Content-type: text/plain; charset=UTF-8",
            "Reply-To: " + list.email.replace('@', '-sub-' + key + '@'),
            "Subject: Confirm your Subscription to " + list.email,
            "",
            "To confirm that you would like '" + to + "'",
            "added to the " + list.email + " mailing list,",
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
                            next();
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

exports.send_welcome_email = function (next, trans, recip, user, list) {
    var plugin = this;

    var to = trans.mail_from;

    var verp = verp_email(to.address());

    var from = list.email.replace('@', '-bw-' + verp + '@');

    var contents = [
        "From: " + list.email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: Welcome to " + list.email,
        "",
        "Welcome '" + to + "' to the " + list.email,
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
                        next();
        }
    };

    outbound.send_email(from, to, contents, outnext);
}

// TODO
exports.list_unsub = function (next, trans, recip, list) {
    var plugin = this;
    users.get_user_by_email(trans.mail_from.address(), function (user) {
        if (!user) {
            return next();
        }

        lists.remove_member(list.id, user.id, function (ok) {
            if (!ok) {
                // DB remove failed... TODO: do something?
                return next();
            }
            plugin.send_goodbye_email(next, trans, recip, list);
        })
    })
}

exports.send_goodbye_email = function (next, trans, recip, list) {
    var plugin = this;

    var to = trans.mail_from;

    var verp = verp_email(to.address());

    var from = list.email.replace('@', '-bw-' + verp + '@');

    var contents = [
        "From: " + list.email.replace('@', '-help@'),
        "To: " + to,
        "MIME-Version: 1.0",
        "Content-type: text/plain; charset=us-ascii",
        "Subject: You are unsubscribed from " + list.email,
        "",
        "Thank you for participating in " + list.email,
        "",
        "Should you wish to re-subscribe at any time, simply email:",
        "  mailto:" + list.email.replace('@', '-subscribe@'),
        ""].join("\n");
    
    var outnext = function (code, msg) {
        switch (code) {
            case DENY:  plugin.logerror("Sending goodbye mail failed: " + msg);
                        break;
            case OK:    plugin.loginfo("Goodbye mail sent");
                        next();
                        break;
            default:    plugin.logerror("Unrecognised return code from sending email: " + msg);
                        next();
        }
    };

    outbound.send_email(from, to, contents, outnext);
}
