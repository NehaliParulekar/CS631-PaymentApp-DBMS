const mysql = require("mysql2")

const con = mysql.createConnection({
    host: "db4free.net",
    user: "harshal",
    password: "harshal123",
    database: "sqlproj",
    multipleStatements: true
})

con.connect((err) => {
    if (err) {
        console.log(err)
        return
    }
    console.log("MySql Database Connected")
})

module.exports = con
