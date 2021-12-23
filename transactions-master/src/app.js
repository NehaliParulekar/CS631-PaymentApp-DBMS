const express = require("express")
require("./db/mysql")
const userRouter = require("./routers/user")

const app = express()

app.use(express.json())
app.use(userRouter)

app.get("/", (req, res) => {
    console.log("Hello Express")
    res.send("Hi")
})

module.exports = app
