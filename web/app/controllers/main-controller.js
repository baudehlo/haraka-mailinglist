exports.setup = function(router){
	
	router.get('/', function(req, res) {
		console.log(req.session.data)
		getFeatured(function(err,locals){
			locals.title = 'Home';
			if(err) res.render('error', {title:'', error:err});
			else res.render('home/index', locals);
		});
	})

	.get('/search/*', function(req, res, query) {
		res.render('search/index', {title:'Search'});
	})

	.get('/logout', function(req, res, query) {
		req.session.data.user = null;
		res.redirect('/');
	})

	.post('/login', function(req, res, query) {
		authenticate(req,function(err,user){
			if(err) res.render('error', {title:locals.title,error:err});
			else if(req.session.data.history.length>1) // redirect to the page you went to before logging in
				res.redirect(req.session.data.history[req.session.data.history.length-1]);
			else res.redirect('/');
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


