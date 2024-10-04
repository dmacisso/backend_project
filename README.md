npm init -y
npm i express
npm i nodemon
npm i ejs
npm i better-sqlite3
npm i bcrypt
npm i jsonwebtoken
npm i dotenv
npm i cookie-parser
npm i sanitize-html
npm i marked


**server.js**
const express = require('express');
const app = express()

//* Use EJS
//* requires a "views" default folder in the project root
app.set("view engine", "ejs")


//* Define project public folder.
app.use(express.static("public"))

//* Routing
app.get("/", (req, res) => {
  res.send("Hello World from our cool app??")
  res.render("homepage")
	
} )

app.get("/login",(req, res ) => {
  res.render("login")

})


//* Run Server on port 3000
app.listen(3000)


https://simplecss.org/
https://sqlitebrowser.org/



 