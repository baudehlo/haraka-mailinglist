exports.setup = function(router){
	
	router.get('/list/*/manage', function(req, res, list) {
		getManagers({list:list},function(err,locals){
			locals.title = 'Manage '+list+' managers';
			if(err) res.render(views.error, {title:locals.title,error:err});
			else res.render('manage/index', locals);
		});
	})

	.post('/list/*/manage/add_manager', function(req, res, list) {
		req.getParams(function(options){
			options.list = list;
			addManager(options,function(err){
				if(err) res.render('error', {title:'Could not add manager', error:err});
				else res.render('templates/thanks', {title:'Thanks',message:'Thanks manager was added to '+list});
			});
		});
	})

	.get('/list/*/manage/tasks', function(req, res, list) {
		getManagerTasks({list:list},function(err,locals){
			locals.title = 'Manage '+list+' tasks';
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('manage/tasks', locals);
		});
	})

	.get('/list/*/manage/tasks/*', function(req, res, list, taskName) {
		getManagerTask({list:list,task:task},function(err,locals){
			locals.title = 'Manage '+list+' task';
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('manage/task', locals);
		});
	})

	.get('/list/*/manage/members', function(req, res, list) {
		getListMembers({list:list},function(err,locals){
			locals.title = 'Manage '+list+' members';
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('manage/members', locals);
		});
	})

	.get('/list/*/manage/settings', function(req, res, list) {
		getListSettings({list:list},function(err,locals){
			locals.title = 'Manage '+list+' settings';
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('manage/settings', locals);
		});
	});
	
}

// temporary data methods until I get a db hookup
function addManager(callback) {
	callback(null);
}

function getManagers(options,callback) {
	callback(null,{list:'',managers:[{name:'Name', email:'asdf@gmail.com'}]});
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
