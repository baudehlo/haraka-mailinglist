// Main Mailing List library

var db  = require('./db');
var log = require('./log');

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
exports.should_moderate = function (mail_from, list, callback) {
    callback(false);
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
