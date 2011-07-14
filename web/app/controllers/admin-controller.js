exports.setup = function(router){
	
	router.get('/admin', function(req, res) {
		res.render('admin/index', {title:'Admin'});
	})
	
}
