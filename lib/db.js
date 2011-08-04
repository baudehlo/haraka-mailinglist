var sqlite = require('sqlite');

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

// CREATE TABLE UserMissedMail (
// 	user_id INTEGER NOT NULL REFERENCES User,
// 	list_id INTEGER NOT NULL REFERENCES List,
// 	timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
// 	message_id TEXT NOT NULL
// );
// CREATE INDEX UserMissedMail_search_idx ON UserMissedMail (user_id, list_id);

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

exports.init = function () {
	var db = new sqlite.Database();

    db.open('mailinglist.db', function (err) {
        if (err) {
            throw err;
        }
    });

    this.db = db;
}

exports.init();

exports.execute = function (sql, binds, cb) {
	// TODO: query via memcached first (?)

	if (!(typeof binds === 'object' && binds.constructor === Array)) {
		// binds is not an array. Make it so:
		binds = [ binds ];
	}

	var self = this;
	// We execute on next tick because otherwise sometimes sqlite
	// will lock up on us.
	process.nextTick(function () { self.db.execute(sql, binds, cb) })
}
