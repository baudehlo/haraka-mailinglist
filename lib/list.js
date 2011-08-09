// Main Mailing List library

var db  = require('./db');
var log = require('./log');
var req = require('request');

// find a list with the given name (email address)
exports.find_list = function (listname, callback) {
    var sql = "SELECT id, email, name FROM List WHERE email = ?";
    db.execute(sql, [listname], function (err, rows) {
        if (err) {
            log.logerror("DB Error: " + err);
            // nothing we can do here but re-add the email and hope it gets
            // delivered somewhere?
            callback();
        }
        else if (rows.length) {
            // can only be one due to index
            log.loginfo("Found the list: " + rows[0].email);
            callback(rows[0]);
        }
        else {
            log.loginfo("List not found");
            callback();
        }
    });
}

// TODO: implement
// Basic rules: List should be allowed to say all posts are moderated, or
//              non-subscriber posts are moderated (or blocked altogether)
//              or certain users posts should be moderated
exports.should_moderate = function (user, list, callback) {
    // callback is: callback(reject, moderate)
    this.is_member(user.id, list, function (is_member) {
        callback(!is_member);
    })
}

exports.is_member = function (user_id, list, callback) {
    var sql = "SELECT list_id, user_id FROM ListMember WHERE list_id = ? AND user_id = ?";

    db.execute(sql, [list.id, user_id], function (err, rows) {
        if (err) {
            log.logerror("Error checking if user is a member: " + err);
            return callback(false);
        }
        return callback(rows.length > 0 ? true : false);
    })
}

exports.get_members = function (list, callback) {
    var sql = "SELECT email, name FROM User, ListMember WHERE user_id = User.id AND list_id = ?";

    db.execute(sql, [list.id], function (err, rows) {
        if (err) {
            log.logerror("Error getting list users: " + err);
            return callback();
        }
        callback(rows);
    });
}

exports.add_member = function (list_id, user_id, cb) {
    var sql = "INSERT INTO ListMember (list_id, user_id) SELECT ?, ? " +
              "WHERE NOT EXISTS (SELECT * FROM ListMember " + 
              "                  WHERE list_id = ? AND user_id = ?)";
    
    db.execute(sql, [list_id, user_id, list_id, user_id], function (err) {
        if (err) {
            log.logerror("Error inserting into ListMember: " + err);
            return cb();
        }
        cb(true);
    })
}

exports.remove_member = function (list_id, user_id, cb) {
    var sql = "DELETE FROM ListMember WHERE list_id = ? AND user_id = ?";

    db.execute(sql, [list_id, user_id], function (err) {
        if (err) {
            log.logerror("Error deleting from ListMember: " + err);
            return cb();
        }
        cb(true);
    })
}

function extract_children(children) {
    return children.map(function(child) {
        var data = {
            bodytext: child.bodytext,
            headers: child.header.headers_decoded
        }
        if (child.children.length > 0) data.children = extract_children(child.children);
        return data;
    }) 
}

function enc_email (email) {
    return email.replace(/[\W_]/g, function (thing) {
        return '_' + thing.charCodeAt(0);
    })
}

exports.archive_email = function (list, transaction, cb) {
    var doc = {};
    var body = transaction.body;
    doc.headers = body.header.headers_decoded;
    doc.bodytext = body.bodytext;
    doc.content_type = body.ct;
    doc.mime_parts = extract_children(body.children);
    doc.list_email = list.email;
    doc.list_id = list.id;
    doc.list_name = list.name;

    var headers = {'content-type':'application/json', 'accept':'application/json'};
    var uri = 'http://localhost:5984/groupalist_archive';
    
    log.loginfo("storing in url: " + uri);

    var message = {uri: uri, method: "POST", headers: headers, body: JSON.stringify(doc)};

    function resolve (err, resp, body) {
        log.loginfo("got back: " + body);
        var id = JSON.parse(body).id;
        cb(id);
    }

    req(message, function(err, resp, body) {
        if (resp.statusCode === 404) {
            var body = JSON.parse(body);
            if (body.error === "not_found" && body.reason === "no_db_file") {
                req({method: "PUT", uri: uri, headers: headers}, function(err, resp, body) {
                    log.logdebug(body);            
                    if (JSON.parse(body).ok === true) {
                        req(message, resolve);
                    }
                    else {
                        // TODO this sucks :D
                        cb();
                    }
                })
            }
        }
        else {
            resolve(err, resp, body);
        }
    });
}
