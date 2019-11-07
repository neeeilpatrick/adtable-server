var express = require("express");
var app = express();
var http = require("http").createServer(app);
var path = require("path");
var bodyParser = require("body-parser");
var crypto = require("crypto");

var config = require("./config.json");
var airtable = require("airtable");
var base = new airtable({apiKey: config.airtable_api}).base(config.airtable_base);

var PORT = 80;

app.use("/js", express.static(path.join(__dirname, "html/js")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({	extended: false	}));

app.use(function (req, res, next) {

	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', '*');
 
	// Request methods you wish to allow
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
 
	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
 
	// Set to true if you need the website to include cookies in the requests sent
	// to the API (e.g. in case you use sessions)
	res.setHeader('Access-Control-Allow-Credentials', true);
 
	next();
 });




app.post("/authenticate", async function(request, response){
	var license = request.body.license;
	var email = request.body.email;
	var validate = await getUsers(license, email);
	response.send(JSON.stringify(validate));
});

app.post("/insert", async function(request, response){
	var fields = JSON.parse(request.body.fields);
	var api = request.body.api;
	var baseid = request.body.baseid;
	var table = request.body.table;
	var id = request.body.user_id;

	console.log(fields);
	try{
		var result = await pushToAirtable(fields, api, baseid, table);

		if(id!=undefined && id!=null) await lastSignedActivity(id);
		response.send(JSON.stringify({status: "success", id: result.id}));
	}catch(err){
		response.send(JSON.stringify({status: "failed"}));
	}
});


http.listen(PORT, ()=>{ console.log(`Listening to port ${PORT}`) });


function lastSignedActivity(id){
	return new Promise((resolve, reject)=>{
		var date = new Date();
		base(config.airtable_table).update([
			{
				id: id,
				fields: {
					"Last Sign Activity": `${date.getFullYear()}-${pad(date.getMonth()+1, 2)}-${pad(date.getDate(), 2)} ${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}`
				}
			}
		], function(err, records){
			resolve();
		});
	});
}

function getUsers(license, account){
	return new Promise((resolve, reject)=>{
		
		var isExist = false;
		var id = null;
		var email = null;
		base(config.airtable_table).select({}).eachPage(function page(records, fetchNextPage){

			records.forEach((record)=>{
				if(record.get("Email")!=undefined){
					var hash = record.get("License Key");
					var expiry = new Date(record.get("Expires"));
					var current = new Date();

					if(account==record.get("Email") && hash==license && record.get("Status")==true && current<=expiry){
						isExist = true;
						id = record.id;
						email = record.get("Email");
					}
				}
				
			});

			fetchNextPage();
		}, function done(err){
			if (err) { console.error(err); return; }

			resolve({status: isExist, email: email, id: id});
		});
	});
}



function pushToAirtable(fields, api, baseid, table){
	console.log(fields);
	console.log(api);
	console.log(baseid);
	console.log(table);
	return new Promise((resolve, reject)=>{
		var user = new airtable({apiKey: api}).base(baseid);
		user(table).create(fields, function(err, record){
			if(err) reject(err);
			resolve(record);
		});
	});
}

function pad(num, size) {
	var s = num+"";
	while (s.length < size) s = "0" + s;
	return s;
 }