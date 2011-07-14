var http = require('http'),
		fs = require('fs'),
		path = require('path'),
		crypto = require('crypto'),
		cache = {}, // this is going to be a view cache, maybe this should be in redis
  	router = require('./lib/router').router(cache), // TODO: need to find a way to cache urls in the browser
		objects = require('./lib/objects').objects(),
		paperboy = require('./lib/paperboy'),
		views = {
			template:fs.readFileSync('./app/views/templates/index.html').toString(),
			error:fs.readFileSync('./app/views/templates/error.html').toString()
		};

require('./lib/session').start();

fs.readdirSync(__dirname + '/app/controllers').forEach(function(controller){
	var name = controller.replace('.js','');
	require('./app/controllers/'+name).setup(router);
});
		
router.notFound(function(req, res) { // redirect home if request is unknown
	paperboy.deliver(path.join(path.dirname(__filename), 'public'), req, res)
	.error(function(statCode, msg) {
		res.writeHead(statCode, {'Content-Type': 'text/plain'});
		res.end("Error " + statCode);
	})
	.otherwise(function(err) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.end("Error 404: File not found");
	});
});

module.exports = http.createServer(router).listen(5000);

http.IncomingMessage.prototype.__defineGetter__('isSignedIn', function(){
	if( this.session.data.user != null) return true; // this.session && this.session.data && 
	return false;
});

http.ServerResponse.prototype.redirect = function(location){
	this.writeHead(302, { Location: location });
	this.end();
}

http.ServerResponse.prototype.render = function(view, locals) {
	this.writeHead(200, {'Content-Type': 'text/html'});
	// maybe we want to write the top of the template, TODO: test this for speed
	var res = this;
	getView(view,function(err,content){
		if(err){
			getView('error',function(err,content){
				locals.error = err;
				content = views.template.replace("<% content %>",content);
				var render = objects.parse(content,locals);
				res.end( render );
				cacheView( view, locals, render );
			});
		}else{
			content = views.template.replace("<% content %>",content);
			var render = objects.parse(content,locals);
			res.end( render );
			cacheView( view, locals, render );
		}
	});
}

http.IncomingMessage.prototype.getParams = function(callback) {
	this.on('data',function(data){
		var nv = data.toString().split('&'), params = {};
		for(i = 0; i < nv.length; i++) {
		  eq = nv[i].indexOf('=');
		  params[nv[i].substring(0,eq).toLowerCase()] = unescape(nv[i].substring(eq + 1));
		} 
		callback(params);
	});
}

function getView(view,callback) {
	var content = views[view];
	if(content) callback(null,content);
	else{
		fs.readFile('./app/views/'+view+'.html',function(err,data){
			if(err) callback(err);
			else{
				content = views[view] = data.toString();
				callback(null,content);
			}
		});
	}
}

function cacheView(view, locals, render) {
	// cache[view+] = render;
}
