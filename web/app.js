var http = require('http'),
		fs = require('fs'),
		path = require('path'),
  	router = require('./lib/router').router(),
		objects = require('./lib/objects').objects(),
		paperboy = require('./lib/paperboy'),
		views = {template:fs.readFileSync('./app/views/templates/index.html').toString()};
		
router.get('/', function(req, res) {
	getFeatured(function(err,locals){
		locals.title = 'Home';
		if(err) render(res, 'templates/error', {title:'', error:err});
		else render(res, 'home/index', locals);
	});
})

.post('/list/new', function(req, res) {
	req.on('data',function(data){
		createNewList(parseParams(data),function(err){
			if(err) render(res, 'templates/error', {title:'', error:err});
			else render(res, 'templates/thanks', {title:'Thanks',message:'an email will be sent to you soon to confirm.'});
		});
	});
})

.get('/list/*', function(req, res, list) {
	getArchive({list:list},function(err,locals){
		locals.title = list;
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'list/index', locals);
	});
})

.get('/list/*/message/*', function(req, res, list, message) {
	getMessage({list:list},function(err,locals){
		locals.title = list +' message';
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'list/message', locals);
	});
})

.get('/list/*/join', function(req, res, list) {
	req.on('data',function(data){
		joinList(parseParams(data),function(err){
			if(err) render(res, views.error, {title:list,error:err});	
			else render(res, 'templates/thanks', {title:'Thanks',message:'an email will be sent to you soon to confirm.'});
		});
	});
})

.get('/list/*/manage', function(req, res, list) {
	getManagers(function(err,locals){
		locals.title = 'Manage '+list+' managers';
		if(err) render(res, views.error, {title:locals.title,error:err});
		else render(res, 'manage/index', locals);
	});
})

.post('/list/*/manage/add_manager', function(req, res, list) {
	req.on('data',function(data){
		var options = parseParams(data);
		options.list = list;
		addManager(options,function(err){
			if(err) render(res, 'templates/error', {title:'Could not add manager', error:err});
			else render(res, 'templates/thanks', {title:'Thanks',message:'Thanks manager was added to '+list});
		});
	});
})

.get('/list/*/manage/tasks', function(req, res, list) {
	getManagerTasks({list:list},function(err,locals){
		locals.title = 'Manage '+list+' tasks';
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'manage/tasks', locals);
	});
})

.get('/list/*/manage/tasks/*', function(req, res, list, taskName) {
	getManagerTask({list:list,task:task},function(err,locals){
		locals.title = 'Manage '+list+' task';
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'manage/task', locals);
	});
})

.get('/list/*/manage/members', function(req, res, list) {
	getListMembers({list:list},function(err,locals){
		locals.title = 'Manage '+list+' members';
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'manage/members', locals);
	});
})

.get('/list/*/manage/settings', function(req, res, list) {
	getListSettings({list:list},function(err,locals){
		locals.title = 'Manage '+list+' settings';
		if(err) render(res, 'templates/error', {title:locals.title,error:err});
		else render(res, 'manage/settings', locals);
	});
})

.get('/search/*', function(req, res, query) {
	render(res, 'search/index', {title:'Search'});
})

.get('/admin', function(req, res) {
	render(res, 'admin/index', {title:'Admin'});
})

.notFound(function(req, res) { // redirect home if request is unknown
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

function render(res, view, locals) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	// maybe we want to write the top of the template, TODO: test this for speed
	getView(view,function(err,content){
		if(err){
			getView('templates/error',function(err,content){
				if(content){
					locals.error = err;
					content = views.template.replace("<% content %>",content);
					res.end( objects.parse(content,locals) );
				}
			});
		}else{
			content = views.template.replace("<% content %>",content);
			res.end( objects.parse(content,locals) );
		}
	});
}

function getView(view,callback) {
	var content = views[view];
	if(content){
		callback(null,content);
	}else{
		fs.readFile('./app/views/'+view+'.html',function(err,data){
			if(err) callback(err);
			else{
				content = views[view] = data.toString();
				callback(null,content);
			}
		});
	}
}

function parseParams(data) { 
	var nv = data.toString().split('&'), result = {};
	for(i = 0; i < nv.length; i++) {
	  eq = nv[i].indexOf('=');
	  result[nv[i].substring(0,eq).toLowerCase()] = unescape(nv[i].substring(eq + 1));
	} 
	return result;
}


// temporary data methods until I get a db hookup
function getFeatured(callback) {
	callback(null,{featured:[
		{createdAt:new Date(), subject:'Example Mailing List',body:
			'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor'},
		{createdAt:new Date(), subject:'Example Mailing List',body:
			'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor'}
		]});
}


function createNewList(values,callback) {
	callback(null);
}

function joinList(values,callback) {
	callback(null);
}

function addManager(callback) {
	callback(null);
}

function getArchive(options,callback) {
	callback(null,{list:options.list,archive:[
		{createdAt:new Date(), subject:'Example Subject', body:'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor '
		+'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'},
		{createdAt:new Date(), subject:'Example Subject', body:'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor '
		+'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'},
		{createdAt:new Date(), subject:'Example Subject', body:'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor '
		+'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'}]});
}

function getMessage(options,callback) {
	callback(null,{list:options.list,createdAt:new Date(), subject:'Example Subject', 
		body:'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor '
		+'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'});
}


function getManagerTasks(options,callback) {
	// list
	callback(null,{list:'',tasks:[{type:'',subject:'first message',body:'body',createdAt:new Date()}]});
}

function getManagerTask(options,callback) {
	// list task
	callback(null,{list:'',task:{type:'',subject:'first message',body:'body',createdAt:new Date()}});
}

function getListMembers(options,callback) {
	// list
	callback(null,{list:'',members:{type:'',name:'Tyler Larson',email:'talltyler@gmail.com',createdAt:new Date()}});
}

function getListSettings(options,callback) {
	// list
	callback(null,{list:'List name',settings:{name:'List name'}});
}

