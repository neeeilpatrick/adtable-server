var express = require("express");
var app = express();
var package = require("./package.json")
var http = require("http").createServer(app);
var path = require("path");
var bodyParser = require("body-parser");
var validator = require('validator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const URL = require('url').URL; // needed this as URL object doesn't work on server

var config = require("./config.json");
var airtable = require("airtable");
var base = new airtable({apiKey: config.airtable_api}).base(config.airtable_base);

var PORT = 80;

console.log(config)
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


app.get("/", function(req, res){
	res.send(JSON.stringify({version: package.version}))
})


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


let API_KEY = 'keyz2Ksi8jQ30902Q'
let BASE = 'applvPBETCOVNI2yL'

app.post("/ghl[-]editor/license[-]status", async function(request, response){
	let key = request.body.key;
	console.log(request.body)
	if(key && key.trim().length > 0){
		if(validator.isUUID(key)){
			try {
				let records = await licenseFilter(`Key = "${key}"`, BASE)
				console.log(records)
				if(records.length > 0) {
					response.status(200).send({
							success: true,
							status: records[0].fields.Status,
							domain: records[0].fields['White Label Domain']
						})
				} else {
					response.status(200).send({ 
						success: false, message: "license does not exist" 
					})
				}
			} catch (err) {
				response.status(500).send({ 
					success: false, message: "something went wrong"
				})
			}
			
		} else {
			response.status(400).send({
				success: false, message: "invalid license" 
			});
		}
	} else {
		response.status(400).send({
			success: false, message: "license key is required" 
		});
	}
});


app.post("/ghl[-]editor/license[-]create", async function(request, response){
	let key = uuidv4();
	if(request.body.email && request.body.white_label_domain){
		let domain = request.body.white_label_domain
		if(domain.trim().length === 0){ 
			response.status(400).send({
				success: false, message: "white label domain is required"
			})
		}
		if(!validator.isEmail(request.body.email)){
			response.status(400).send({
				success: false, message: "email is required"
			})
		}
		if(!(domain.startsWith("http://") || domain.startsWith("https://"))){
			domain = `https://${domain}`
		}

		try {
			console.log(domain)
			url = new URL(domain)
			domain = url.hostname
			let insertData = {
				"Name": request.body.name || null,
				"Email": request.body.email,
				"Status": "Active",
				"Key": key,
				"White Label Domain": domain,
			}
			// create new record on airtable
			try {
				const result = await axios.post(`https://api.airtable.com/v0/${BASE}/Licenses`, {
					records: [{fields: insertData}]
				}, 
					{
						headers: {
						'Authorization': `Bearer ${API_KEY}`,
						"Content-Type": "application/json"
					},
				});
				response.status(200).send({
					success: true, key: key
				})
			} catch (error) {
				console.error(error);
				response.status(500).send({
					success: false, message: "something went wrong"
				})
			}
			
		} catch( error ) {
			response.status(400).send({
				success: false, message: "invalid white label domain"
			})
		}

	} else {
		response.status(400).send({
			success: false, message: "email and white label domain are required"
		})
	}
});


app.post("/ghl[-]editor/license[-]update", async function(request, response){
	let key = request.body.key;
	if(key && key.trim().length > 0){
		if(validator.isUUID(key)){
			try {
				let records = await licenseFilter(`Key = "${key}"`, BASE)
				console.log(records)
				if(records.length > 0) {

					try {
						const result = await axios.patch(`https://api.airtable.com/v0/${BASE}/Licenses`, {
							records: [{
								id: records[0].id,
								fields: {
									"Status": request.body.action === "activate" ? "Active" : "Suspended"
								}
							}]
						}, 
							{
								headers: {
								'Authorization': `Bearer ${API_KEY}`,
								"Content-Type": "application/json"
							},
						});
						response.status(200).send({
							success: true
						})
					} catch (error) {
						console.error(error);
						response.status(500).send({
							success: false, message: "something went wrong"
						})
					}
				} else {
					response.status(200).send({
						success: false, message: "license does not exist"
					})
				}
			} catch (err) {
				response.status(500).send({
					success: false, message: "something went wrong"
				})
			}
		} else {
			response.status(400).send({
				success: false, message: "invalid license"
			});
		}
	} else {
		response.status(400).send({
			success: false, message: "license key is required"
		});
	}
})


async function licenseFilter(filterFormula, table_base){
	try {
    const response = await axios.get(`https://api.airtable.com/v0/${table_base}/Licenses`, {
			headers: {
				'Authorization': `Bearer ${API_KEY}`
			},
			params: {
				filterByFormula: filterFormula
			},
		});
    return response.data.records
  } catch (error) {
    console.error(error);
  }
}


// NOTIFICATION TAMER ENDPOINTS
app.post("/notif[-]tamer/license[-]create", async function(request, response){
	let key = uuidv4();
	let NOTIF_BASE = 'appFvscLNzEXFGX7e';
	if(request.body.email){
		if(!validator.isEmail(request.body.email)){
			response.status(400).send({
				success: false, message: "email is required"
			})
		}

		let insertData = {
			"Name": request.body.name || null,
			"Email": request.body.email,
			"Status": "Active",
			"Key": key,
		}
		// create new record on airtable
		try {
			const result = await axios.post(`https://api.airtable.com/v0/${NOTIF_BASE}/Licenses`, {
				records: [{fields: insertData}]
			}, 
				{
					headers: {
					'Authorization': `Bearer ${API_KEY}`,
					"Content-Type": "application/json"
				},
			});
			response.status(200).send({
				success: true, key: key
			})
		} catch (error) {
			console.error(error);
			response.status(500).send({
				success: false, message: "something went wrong"
			})
		}

	} else {
		response.status(400).send({
			success: false, message: "email is required"
		})
	}
});

app.post("/notif[-]tamer/license[-]status", async function(request, response){
	let key = request.body.key;
	let email = request.body.email;
	let NOTIF_BASE = 'appFvscLNzEXFGX7e';
	console.log(request.body)
	if(key && key.trim().length > 0 && email && email.trim().length > 0){
		if(!validator.isEmail(request.body.email) || !validator.isUUID(key)){
			response.status(400).send({
				success: false, message: "invalid email or license"
			})
		}
		try {
			let records = await licenseFilter(`Key = "${key}"`, NOTIF_BASE)
			console.log(records)
			if(records.length > 0) {
				response.status(200).send({
					success: true,
					status: records[0].fields.Status,
					email: records[0].fields.Email
				})
			} else {
				response.status(200).send({ 
					success: false, message: "license does not exist" 
				})
			}
		} catch (err) {
			response.status(500).send({ 
				success: false, message: "something went wrong"
			})
		}
	} else {
		response.status(400).send({
			success: false, message: "license key and email are required" 
		});
	}
});

app.post("/notif[-]tamer/license[-]update", async function(request, response){
	let key = request.body.key;
	let email = request.body.email;
	let NOTIF_BASE = 'appFvscLNzEXFGX7e';
	if(key && key.trim().length > 0 && email && email.trim().length > 0){
		if(!validator.isEmail(request.body.email) || !validator.isUUID(key)){
			response.status(400).send({
				success: false, message: "invalid email or license"
			})
		}
		
		try {
			let records = await licenseFilter(`Key = "${key}"`, NOTIF_BASE)
			console.log(records)
			if(records.length > 0) {
				try {
					const result = await axios.patch(`https://api.airtable.com/v0/${NOTIF_BASE}/Licenses`, {
						records: [{
							id: records[0].id,
							fields: {
								"Status": request.body.action === "activate" ? "Active" : "Suspended"
							}
						}]
					}, 
						{
							headers: {
							'Authorization': `Bearer ${API_KEY}`,
							"Content-Type": "application/json"
						},
					});
					response.status(200).send({
						success: true
					})
				} catch (error) {
					console.error(error);
					response.status(500).send({
						success: false, message: "something went wrong"
					})
				}
			} else {
				response.status(200).send({
					success: false, message: "license does not exist"
				})
			}
		} catch (err) {
			response.status(500).send({
				success: false, message: "something went wrong"
			})
		}

	} else {
		response.status(400).send({
			success: false, message: "license key and email are required" 
		});
	}
})
// END NOTIFICATION TAMER ENDPOINTS