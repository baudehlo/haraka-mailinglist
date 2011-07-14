exports.setup = function(router){

	router.post('/list/new', function(req, res) {
		req.getParams(function(params){
			createNewList(params,function(err){
				if(err) res.render('error', {title:'', error:err});
				else res.render('templates/thanks', {title:'Thanks',message:'an email will be sent to you soon to confirm.'});
			});
		});
	})

	.get('/list/*', function(req, res, list) {
		getArchive({list:list},function(err,locals){
			locals.title = list;
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('list/index', locals);
		});
	})

	.get('/list/*/message/*', function(req, res, list, message) {
		getMessage({list:list},function(err,locals){
			locals.title = list +' message';
			if(err) res.render('error', {title:locals.title,error:err});
			else res.render('list/message', locals);
		});
	})

	.post('/list/*/join', function(req, res, list) {
		req.getParams(function(params){
			joinList(params,function(err){
				if(err) res.render(views.error, {title:list,error:err});	
				else res.render('templates/thanks', {title:'Thanks',message:'an email will be sent to you soon to confirm.'});
			});
		});
	})
	
}

// temporary data methods until I get a db hookup
function createNewList(values,callback) {
	callback(null);
}

function joinList(values,callback) {
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

