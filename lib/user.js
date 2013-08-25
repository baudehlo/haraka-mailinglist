// Access to users

var db = require('./db');
var log = require('./log');
var util = require('util');

exports.delete_user = function (id, cb) {
	// TODO
}

exports.get_user_by_key = function (key, cb) {
	var sql = "SELECT * FROM ListUser WHERE key = $1";

	db.execute(sql, [key], function(err, rows) {
        if (err) {
            log.logerror("Error getting user: " + err);
            return cb();
        }
		if (!rows.length) {
			return cb();
		}
		return cb(rows[0]);
	});
}

exports.get_user_by_email = function (email, cb) {
	var sql = "SELECT * FROM ListUser WHERE email = $1";

	db.execute(sql, [email], function (err, rows) {
        if (err) {
            log.logerror("Error getting user: " + err);
            return cb();
        }
        if (!rows.length) {
        	return cb();
        }
        return cb(rows[0]);
    });
}

exports.confirm_user = function (user, cb) {
	var sql = "UPDATE ListUser SET confirmed = 't', key = NULL WHERE id = $1";

	db.execute(sql, [user.id], function (err) {
		if (err) {
			log.logerror("DB Error updating user: " + err);
			return cb();
		}
		return cb(true);
	})
}

exports.create_user = function (email, cb) {
	var sql = "INSERT INTO ListUser (email) VALUES ($1)";
	var self = this;

	db.execute(sql, [email], function (err) {
		if (err) {
			log.logerror("DB Error inserting into User: " + err);
			return cb();
		}
		self.get_user_by_email(email, cb);
	})
}

exports.set_key = function (user, key, cb) {
	var sql = "UPDATE ListUser SET key = $1 WHERE id = $2";
	db.execute(sql, [key, user.id], function (err) {
		if (err) {
			log.logerror("Failed to set user key: " + err);
			return cb();
		}

		return cb(true);
	})
}
