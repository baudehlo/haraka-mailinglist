// Logging library

exports.logerror = function (str) {
	console.log("ERROR: %s", str);
}

exports.loginfo = function (str) {
	console.log("INFO: %s", str);
}

exports.logdebug = function (str) {
	console.log("DEBUG: %s", str);
}