var pg = require('pg');

// CREATE TABLE ListUser (
//   id INTEGER PRIMARY KEY,
//   email VARCHAR(255) NOT NULL,
//   confirmed INTEGER NOT NULL DEFAULT 0,
//   name VARCHAR(1000),
//   passwd_hash VARCHAR(255),
//   key VARCHAR(100),
//   signup_date TIMESTAMP NOT NULL DEFAULT current_timestamp
//   );
// CREATE UNIQUE INDEX ListUser_email ON ListUser (email);

// CREATE TABLE UserMissedMail (
//  user_id INTEGER NOT NULL REFERENCES ListUser,
//  list_id INTEGER NOT NULL REFERENCES List,
//  missed_date TIMESTAMP NOT NULL DEFAULT current_timestamp,
//  message_id VARCHAR(255) NOT NULL
// );
// CREATE INDEX UserMissedMail_search_idx ON UserMissedMail (user_id, list_id);

// CREATE TABLE List (
//   id INTEGER PRIMARY KEY,
//   email VARCHAR(255) NOT NULL,
//   name VARCHAR(1000)
//   );
// CREATE UNIQUE INDEX List_email ON List (email);

// CREATE TABLE ListMember (
//   list_id INTEGER NOT NULL REFERENCES List,
//   user_id INTEGER NOT NULL REFERENCES ListUser
//   );
// CREATE UNIQUE INDEX ListMember_uniq ON ListMember (list_id, user_id);

// CREATE TABLE ListAdmin (
//   list_id INTEGER NOT NULL REFERENCES List,
//   user_id INTEGER NOT NULL REFERENCES ListUser
//   );
// CREATE UNIQUE INDEX ListAdmin_uniq ON ListAdmin (list_id, user_id);


exports.init = function () {
    var connectionString = "pg://groupalist:funnybones@localhost/groupalist";

    var self = this;
    pg.connect(connectionString, function (err, client) {
        if (err) {
            throw err;
        }
        self.db = client;
    });
}

exports.init();

exports.execute = function (sql, binds, cb) {
	// TODO: query via memcached first (?)

    if (!this.db) {
        // db not ready yet
        if (this.loop_count && this.loop_count > 10) {
            throw "Database connection timed out";
        }
        this.loop_count = this.loop_count || 0;
        this.loop_count++;

        // try again in 100ms
        var self = this;
        return setTimeout(function () { self.execute(sql, binds, cb) }, 100);
    }

	if (!(typeof binds === 'object' && binds.constructor === Array)) {
		// binds is not an array. Make it so:
		binds = [ binds ];
	}

	var self = this;
	// We execute on next tick because otherwise sometimes sqlite
	// will lock up on us.
	process.nextTick(
        function () {
            self.db.query(sql, binds, function (err, results) {
                if (err) {
                    cb(err.message);
                }
                else {
                    cb(null, results.rows);
                }
            })
        }
    );
}
