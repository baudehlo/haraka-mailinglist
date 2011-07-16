var parseURL = require('url').parse;
var crypto = require('crypto');

exports.setup = function(router){
	
	router.get('/', function(req, res) {
		getFeatured(function(err,locals){
			locals.title = 'Home';
			if(err) res.render('error', {title:'', error:err});
			else res.render('home/index', locals);
		});
	})

	.get('/search', function(req, res) {
		var query = parseURL(req.url,true).query.q;
		res.render('home/search', {title:'Search', query:query});
	})

	.get('/logout', function(req, res, query) {
		req.session.data.user = null;
		res.redirect('/');
	})

	.post('/login', function(req, res, query) {
		authenticate(req,function(err,user){
			if(err) res.render('error', {title:'',error:err});
			else if(req.session.data.history.length>1) // redirect to the page you went to before logging in
				res.redirect(req.session.data.history[req.session.data.history.length-1]);
			else res.redirect('/');
		});
	})
	
	.get('/forgot_password', function(req, res, query) {
		res.render('home/forgot', {title:'Forgot Password', query:query});
	})
	
	.post('/forgot_password', function(req, res, query) {
		req.getParams(function(params){
			resetPassword(params,function(err){
				if(err) res.render('error', {title:'', error:err});
				else res.render('templates/thanks', {title:'Thanks',message:'An email will be sent to you with your new password, make sure to update your password in account settings.'});
			});
		});
	})
	
	
	.post('/register', function(req, res) {
		req.getParams(function(params){
			createUser(params,function(err){
				if(err) res.render('error', {title:'', error:err});
				else res.render('templates/thanks', {title:'Thanks',message:'An email will be sent to you soon to confirm your registration.'});
			});
		});
	})
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

function createUser(params,callback) {
	// params: email, password, name(optional list name)
	callback(null,{user:{}});
}

function resetPassword(params, callback) {
	// params:	email
	// return error if email is not found
	callback(null);
}



function createHash(data,salt) {
	if( typeof(salt) != 'undefined'){
		return crypto.createHmac('sha256', salt).update(data).digest('hex');
	}else{
		return crypto.createHash('sha256').update(data).digest('hex'); 
	}
}

function authenticate(req,callback) {
	req.getParams(function(params){
		findUser(params.username,function(err,user){
			if(err) callback(err);
			else{
				if( user.hash == createHash(params.password, user.salt) ) {
					req.session.data.user = user;
					callback(null, user);
				}else callback('Password did not match.');
			}
		});
	});
}

function findUser(username,callback) {
	callback(null,{username:'example',salt:'',hash:''});
}


