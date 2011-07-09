exports.objects = function()
{	
	var _rootToken; // :Token
	var _currentToken; // :Token
	var _objCount = 0; //:int
	
	var MATH_SYMBOLS = /[*\/\-+%]/gim; // :RegExp
	var SPLIT_ARGUMENTS = /(?:^|,)(\"(?:[^\"]+|\"\")*\"|[^,]*)/gim; // :RegExp
	var METHOD_START = /[\sA-Za-z0-9\.\$_]*\(/gim; //:RegExp
	var EQUALS = "=";
	var FOR = "for";
	var FOR_EACH = "for each";
	var EACH = "each";
	var IF = "if";
	var ELSE = "else";
	var ELSE_IF = "else if";
	var VAR = "var";
	var INCLUDE = "include";
	var END = "end";
	var STANDARD = "standard";
	var LOGIC = "logic";
	var EMPTY = "";
	
	// source:String, data:Object=null, startChars:String="<%", endChars:String="%>" ) :String
	function parse( source, data, startChars, endChars ) 
	{
		var myRegExp = new RegExp( (startChars||"<%")+"(.*?)"+(endChars||"%>"), "igm" ); // :RegExp
		var output = myRegExp.exec(source); // :Array
		var lastIndex = 0; // :int
		var before; // :String
		var tokens = []; // :Array

		while(output != null) {
			before = source.substring(lastIndex, output.index);
			if( before != EMPTY ){
				tokens.push( new Token.init( STANDARD, before ) );
			}
			tokens.push( new Token.init( LOGIC, output[1] ) );
			lastIndex = myRegExp.lastIndex;
			output = myRegExp.exec(source);
		}
		
		if( lastIndex != source.length ){
			tokens.push( new Token.init( STANDARD, source.substring(lastIndex, source.length) ) );
		}
		
		_rootToken = new Token.init( STANDARD, EMPTY );
		_currentToken = _rootToken;
		tokens.forEach( structureTokens );
		var result = parseTokens( _rootToken.children, data ); // :String
		
		// Cleanup objects
		_rootToken = null;
		_currentToken = null;
		
		return result;
	}

	//  token:Token, index:int, arr:Array ):void 
	function structureTokens( token, index, arr )
	{
		var text = trimLeft( token.text ); // :String
		if( text.indexOf( IF ) == 0 || text.indexOf( FOR ) == 0 ) {
			token.parent = _currentToken;
			if(_currentToken.children == undefined ){
				_currentToken.children = [];
			}
			_currentToken.children.push( token );
			_currentToken = token;
		}else if( text.indexOf( ELSE_IF ) == 0 || text.indexOf( ELSE ) == 0 ) {
			if( _currentToken.parent != null ) {
				_currentToken = _currentToken.parent;
			}
			token.parent = _currentToken;
			_currentToken.children.push( token );
			_currentToken = token;
		}else if( text.indexOf( END ) == 0 ) {
			_currentToken = _currentToken.parent;
		}else{
			if(_currentToken.children == undefined ){
				_currentToken.children = [];
			}
			_currentToken.children.push( token );
		}	
	}
	
	/**
	 * Parse the tokens into different types.
	 * @private
	 * @param tokens Array 
	 * @param data Object 
	 * @return String 
	 */
	function parseTokens( tokens, data )
	{
		var result = EMPTY;
		var ifResult; // :Boolean
		var forObject; // :Object
		var forResult; // :Array
		var item; // :*
		var i; // :int
		tokens.forEach(function(token){
			if( token.type == LOGIC ) {
				forResult = [];
				if( token.text.indexOf( IF ) == 0 ) {
					ifResult = resolveCondition( token, data );
					if( ifResult ) {
						result += parseTokens( token.children, data );
					}
				}else if( token.text.indexOf( ELSE_IF ) == 0 ) {
					if( !ifResult ) {
						ifResult = resolveCondition( token, data );
						if( ifResult ) {
							result += parseTokens( token.children, data );
						}
					}
				}else if( token.text.indexOf( ELSE ) == 0 ) {
					if( !ifResult ) {
						result += parseTokens( token.children, data );
					}
				}else if( token.text.indexOf( FOR_EACH ) == 0 ) {
					forObject = resolveForObject( token, data );
					if( forObject.object.hasOwnProperty("length") ) { // 
						for( i=(forObject.offset||0); i < (forObject.limit||forObject.object.length); i++ ){
							resolveLoopChildren( token, data, forObject.object[i], forObject ).forEach(function(r){
								forResult.push(r);
							});
							_objCount++;
						}
					}else{
						forObject.object.forEach(function(item){
							forResult.concat(resolveLoopChildren( token, data, item, forObject ) );
							_objCount++
						});
					}
					token.children = forResult;
					result += parseTokens( token.children, data );
				}else if( token.text.indexOf( FOR ) == 0 ) {
					forObject = resolveForObject( token, data );
					if( forObject.object.isArray() ) {
						for( i=(forObject.offset||0); i < (forObject.limit||forObject.object.length); i++ ){
							forResult.push.apply(null, resolveLoopChildren( token, data, i, forObject ) );
							_objCount++
						}
					}else{
						Object.keys(forObject.object).forEach(function(item){
							forResult.push.apply(null, resolveLoopChildren( token, data, item, forObject ) );
							_objCount++
						});
					}
					token.children = forResult;
					result += parseTokens( token.children, data );
				}else if( token.text.indexOf( VAR ) == 0 ) {
					resolveVar( token, data );
				}else{
					result += String( resolveObject( token.text, data ) );
				}
			}else{
				result += token.text;
			}
		})
		
		return result;
	}
	
	/**
	 * Loop over all children and change variable to unique name and save value into data
	 * @private
	 * @param token Token 
	 * @param data Object 
	 * @param item * 
	 * @param forObject Object 
	 * @return Array 
	 */
	function resolveLoopChildren( token, data, item, forObject )
	{
		var result = []; // :Array
		var objName = "$_"+_objCount; // :String
		var newToken; // :Token
		token.children.forEach(function(subToken){
			newToken = {type:subToken.type,parents:subToken.parents,children:subToken.children, text:subToken.text};
			if( newToken.type == LOGIC ) {
				newToken.text = newToken.text.split( trim( forObject.variable ) ).join( objName );
				data[objName] = item;
				if( newToken.children != undefined && newToken.children.length != 0 ) {
					newToken.children = resolveLoopChildren( newToken, data, item, forObject );
				}
			}
			result.push( newToken );
		});
		return result;
	}
	
	/**
	 * Parse for loop tokens like this: for( user in users, limit:4, offset:2 )
	 * @private
	 * @param token Token 
	 * @param data Object 
	 * @return Object 
	 */
	function resolveForObject( token, data )
	{
		var result = {}; // :Object
		var subparts; // :Array
		var parts = token.text.split( FOR ).join(EMPTY).split( EACH ).join(EMPTY).split("(").join(EMPTY).split(")").join(EMPTY).split(","); // :Array
		var forParts = parts[0].split( " in " ); // :Array
		result.variable = forParts[0];
		result.object = trim(forParts[1]);
		
		if( result.object.indexOf("..") != -1 ) {
			result.object = resolveRange( result.object, data );
		}else{
			result.object = resolveObject( ( result.object||"" ), data );
		}
		
		if( parts.length > 1 ) { // limit
			subparts = parts[1].split(":");
			result[trim(subparts[0].toLowerCase())] = parseInt(trim(subparts[1]));
		}
		
		if( parts.length > 2 ) { // offset
			subparts = parts[2].split(":");
			result[trim(subparts[0].toLowerCase())] = parseInt(trim(subparts[1]));
		}
		
		return result;
	}
	
	/**
	 * Parse conditional tokens like this: user.name == 'tobi' || user.name == 'bob'
	 * @private
	 * @param token Token 
	 * @param data Object 
	 * @return Boolean 
	 */
	function resolveCondition( token, data )
	{
		var result; // :Boolean
		var conditionChars = trim(token.text.substr(3, token.text.length-1).split("e if").join(EMPTY) )
													.split("(").join(EMPTY).split(")").join(EMPTY).split(EMPTY); // :Array
		var parts = []; // :Array
		var currentCondition; // :Object
		var currentPart = EMPTY; // :String
		var index = 0; // :int
		conditionChars.forEach(function(char){
			if( char == EQUALS && conditionChars[index+1] == char  ) {
				currentCondition = { left:trim(currentPart), comparison:"==" };
				parts.push( currentCondition );
				currentPart = EMPTY;
			}else if( char == "<" && conditionChars[index+1] == EQUALS ){
				currentCondition = { left:trim(currentPart), comparison:"<=" };
				parts.push( currentCondition );
				currentPart = EMPTY;
			}else if( char == ">" && conditionChars[index+1] == EQUALS ){
				currentCondition = { left:trim(currentPart), comparison:">=" };
				parts.push( currentCondition );
				currentPart = EMPTY;
			}else if( char == "!" && conditionChars[index+1] == EQUALS ){
				currentCondition = { left:trim(currentPart), comparison:"!=" };
				parts.push( currentCondition );
				currentPart = EMPTY;
			}else if( char == "|" && conditionChars[index+1] == "|" ){
				currentCondition.right = trim(currentPart);
				result = evalCondition( currentCondition, data );
				if( result ) {
					return true;
				}
				currentPart = EMPTY;
			}else if( char == "&" && conditionChars[index+1] == "&" ){
				currentCondition.right = trim(currentPart);
				result = evalCondition( currentCondition, data );
				if( !result ) {
					return false;
				}
				currentPart = EMPTY;
			}else if( char != "&" && char != EQUALS && char != "|" && char != "<" && char != ">" ){
				currentPart += char;
			}
			index++
		});
		currentCondition.right = trim(currentPart);
		return evalCondition( currentCondition, data );
	}
	
	/**
	 * Evaluate conditional to true or false based on its conditional type: (==,!=,>=,)
	 * @private
	 * @param condition Object 
	 * @param data Object 
	 * @return Boolean 
	 */
	function evalCondition( condition, data )
	{
		var left = resolveObject( condition.left, data );
		var right = resolveObject( condition.right, data );
		var result; // :Boolean
		switch( condition.comparison ) {
			case "==":
				left == right ? result = true : result =  false; 
				break;
			case "!=":
				left != right ? result = true : result = false; 
				break;
			case "<=":
				left <= right ? result = true : result = false; 
				break;
			case ">=":
				left <= right ? result = true : result = false; 
				break;
		}
		return result;
	}
	
	/**
	 * Assign variable to data object: var item = 4
	 * @private
	 * @param token Token 
	 * @param data Object 
	 */
	function resolveVar( token, data )
	{
		var parts = token.text.substr(4).split(EQUALS);
		data[trim(parts[0])] = resolveObject( parts[1], data );
	}
	
	/**
	 * Resolve ranges like 1..item.length
	 * @private
	 * @param object String 
	 * @param data Object 
	 * @return Array 
	 */
	function resolveRange( object, data )
	{
		var parts; // :Array
		var result = []; // :Array
		var i; // :int
		if( object.indexOf("...") != -1 ) {
			parts = object.split("...");
			for( i = int(resolveObject( trim(parts[0] ), data )); i <= int(resolveObject( trim(parts[1]), data )); i++ ) {
				result.push(i);
			}
		}else if( object.indexOf("..") != -1 ) {
			parts = object.split("..");
			for( i = int(resolveObject( trim(parts[0]), data )); i < int(resolveObject( trim(parts[1]), data )); i++ ) {
				result.push(i);
			}
		}
		return result;
	}
	
	/**
	 * Resolve an object defined as a String into its Object value
	 * @private
	 * @param object String 
	 * @param data Object
	 * @return  
	 */
	function resolveObject( object, data )
	{
		object = trim( object );
		if( object == "null" ) {
			return null;
		}else if( object.indexOf("+") != -1 || object.indexOf("-") != -1 || object.indexOf("*") != -1 
				|| object.indexOf("/") != -1 || object.indexOf("%") != -1 ) { // break out to math parse because we have math symbols
			return resolveMath( object, data );
		}else if( object.indexOf("'") == 0 || object.indexOf('"') == 0 ) { // must be a String if starts with " or '
			object = trim( object );
			return object.substr( 1, object.length-2 );
		}else if( object.search( /\d+/ ) == 0 ){ // if starts with number, must be number
			return parseFloat( object );
		}else if( object == "true" ){
			return true;
		}else if( object == "false" ){
			return false;
		}else if( object == "null" ){
			return null;
		}else{ // otherwise it must be an object
			//var parts:Array = object.split("[").join(".").split("]").join(EMPTY).split(".");
			var obj = data;
			var parts;
			var part;
			var wholeObj = object.split("[").join(".").split("]").join(EMPTY);
			if( METHOD_START.test( wholeObj ) ) { // has characters and then ( character which means if must be a method
				var count = 0; // :int
				var methodStr = wholeObj.substr( 0, wholeObj.indexOf("(") ); // :String
				var method = resolveDotObject( methodStr, data ); // :Function
				METHOD_START.test( wholeObj ); // JS is crazy,if you take this line out it breaks, why?
				return resolveMethod( method, wholeObj, data );
			}else{
				return resolveDotObject( wholeObj, data );
			}
			return obj;
		}
		return obj;
	}
	
	/**
	 * Resolve a String with dot syntax, 
	 * @param object 	A String like this this.main.alpha
	 * @param data 		The data object that stores all of our name/value pairs
	 * @private
	 * @return returns an untyped object 
	 */
	function resolveDotObject( object, data )
	{
		var parts = object.split("."); // :Array
		var result = data; // :*
		parts.forEach(function(part){
			part = part.split("(")[0];
			//console.log(part, "part")
			if( result.hasOwnProperty(part) || result[part] ) {
				if(typeof result[part] != "function") {
					result = result[part];
				}
			}else if(part != ""){
				console.log( "Error", part, "is not contained on", result );
				return null;
			}
		});
		//console.log(result, "result")
		return result;
	}
	
	/**
	 * @private
	 * @param obj *				The scope that this method is on
	 * @param method String 	The name of the method
	 * @param part String 		The whole string that we are working with
	 * @param data Object		The data object that stores all of our name/value pairs
	 * @return  
	 */
	function resolveMethod( func, whole, data )
	{
		var args = whole.split("(")[1].split(")").join(EMPTY).match(SPLIT_ARGUMENTS); // :Array
		var length = args.length; // :uint
		for( var i = 0; i < length; i++ ) {
			args[i] = resolveObject( trimChars( args[i], [','] ), data );
		}
		if( args[args.length-1] == EMPTY ) {
			args.pop();
		}
		//console.log(func, "func")
		
		var parts = whole.split("."); // :Array
		return (func)[parts[parts.length-1].split("(")[0]](args[0],args[1],args[2],args[3],args[4],args[5]); //.apply( null, args );
		// JavaScript kind of sucks, not sure why apply doesn't work
	}
	
	/**
	 * This method resolves equations like this: users.length + 340.5 * users.length / 2.35 % 3 
	 * @param object String 
	 * @param data Object
	 * @private
	 * @return  
	 */
	function resolveMath( source, data )
	{
		var result;
		var output = MATH_SYMBOLS.exec(source); // :Array
		var lastIndex = 0; // :int
		var tokens = []; // :Array
		var lastToken; // :Token
		
		while(output != null) {
			tokens.push( new Token.init( output[0], source.substring( lastIndex, MATH_SYMBOLS.lastIndex-1 ) ) );
			lastIndex = MATH_SYMBOLS.lastIndex;
		    output = MATH_SYMBOLS.exec(source);
		}
		
		if( lastIndex != source.length ){
			tokens.push( new Token.init( EMPTY, source.substring(lastIndex, source.length) ) );
		}
		
		lastToken = tokens.shift();
		result = resolveObject( lastToken.text, data );
		
		tokens.forEach(function(token){
			var obj = resolveObject( token.text, data );
			result = evalMath( result, lastToken.type, obj );
			lastToken = token;
		});
		
		return result;
	}
	
	/**
	 * Evaluate the resulting value within the equation between the two parts
	 * @private
	 * @param	left 	Left side of the equation
	 * @param	symbol 	The mathematical symble used to put the two parts together
	 * @param	right 	Right side of the equation
	 * @return  
	 */
	function evalMath( left, symbol, right )
	{
		switch( symbol ) {
			case "+" : return left + right; break;
			case "-" : return left - right; break;
			case "*" : return left * right; break;
			case "/" : return left / right; break;
			case "%" : return left % right; break;
		}
		return null; 
	}
	
	return {parse:parse};

}

var Token = 
{
	type:null, // :String
	parent:null, // :Token
	text:null, // :String
	children: [], // :Array
	init: function( type, text, parent, children )
	{
		this.type = type;
		this.parent = parent;
		this.text = trim(text);
		if( children != null && children != undefined ) {
			this.children = children;
		}
	},
	clone: function()
	{
		return new Token.init( type, text, parent, children );
	}
}

/**
 * Trim whitespace and characters from begining and end of String
 * @param input String
 * @param stripChars Array 
 * @private
 * @return String 
 */
function trimChars(input, stripChars )
{
	return ltrim( rtrim(input, stripChars), stripChars);
}

/**
 * Trim whitespace and characters from begining of String
 * @param input String
 * @param stripChars Array
 * @private
 * @return String 
 */
function ltrim(input, stripChars )
  {
	var size = input.length;
	for(var i = 0; i < size; i++) {
		if( input.charCodeAt(i) > 32 && stripChars.indexOf( input.charAt(i) ) == -1 ){
			return input.substring(i);
		}
	}
	return "";
  }

/**
 * Trim whitespace and characters from end of String
 * @param input String
 * @param stripChars Array
 * @private
 * @return String 
 */
function rtrim(input, stripChars )
{
	var size = input.length;
	for( var i = size; i > 0; i-- ){
		if( input.charCodeAt(i - 1) > 32 && stripChars.indexOf( input.charAt(i - 1) ) == -1 ){
			return input.substring(0, i);
		}
	}
	return "";
}

function trim(input) {
	if (input == null) { return ''; }
	return input.replace(/^\s+|\s+$/g, '');
}

function trimLeft(input) {
	if (input == null) { return ''; }
	return input.replace(/^\s+/, '');
}