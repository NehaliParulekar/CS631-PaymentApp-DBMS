const express = require("express")
const auth = require("../middleware/auth")
const { dbQuery } = require("../common/utils")
const router = new express.Router()

router.post("/user/login", async (req, res) => {
    const email = req.body.email
    const password = req.body.password
    if (!(email && password)) {
        res.status(400).send("Please provide Email and Password")
        return true
    }
    results = await dbQuery(
        `SELECT * FROM users WHERE email='${email}' AND password='${password}';`
    )
    if (!results.length) {
        res.status(401).send({ error: "Unauthorized" })
        return true
    }
    user = results[0]
    data = {
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        balance: user.balance
    }
    res.send(data)
})

router.get("/user/:userId/profile", auth("userId"), async (req, res) => {
    data = {
        userId: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        balance: req.user.balance
    }
    res.send(data)
})

router.post("/user/:userId/profile-update", auth("userId"), async (req, res) => {
    try {
        query = `UPDATE users SET name='${req.body.name}', email='${req.body.email}', phone='${req.body.phone}' WHERE id=${req.user.id};`
        await dbQuery(query)
        data = req.body
        data.userId = req.user.id
        data.balance = req.user.balance
        res.send(data)
    } catch (e) {
        res.status(400).send("Update Failed")
        return true
    }
})

router.post("/user/:userId/get-total-amount", auth("userId"), async (req, res) => {
    const fromDate = req.body.fromDate
    const toDate = req.body.toDate
    if (!(fromDate && toDate)) {
        res.status(400).send("Please provide Date Range")
        return true
    }
    results = await dbQuery(
        `select sum(case when sender_id = ${req.user.id} then amount else null end) as amount_sent, sum(case when receiver_id = ${req.user.id} then amount else null end) as amount_received from transactions where sender_id = ${req.user.id} or receiver_id = ${req.user.id} and date(transaction_date) >= '${fromDate}' and date(transaction_date) <= '${toDate}';`
    )
    if (!results.length) {
        res.status(404).send("No Data Found")
        return true
    }
    data = results[0]
    res.send(data)
})

router.post("/user/:userId/transactions", auth("userId"), async (req, res) => {
    const fromDate = req.body.fromDate
    const toDate = req.body.toDate
    const month = req.body.month
    const receiverName = req.query.receiverName ? req.query.receiverName : ""
    const receiverEmail = req.query.receiverEmail ? req.query.receiverEmail : ""
    const receiverPhone = req.query.receiverPhone ? req.query.receiverPhone : ""
    const type = req.query.type ? req.query.type : ""
    const userId = req.query.userId ? req.query.userId : null
    query = `SELECT * FROM (SELECT a.transaction_id, IF(a.type = 'debit', receiver.id, sender.id) AS account_id, IF(a.type = 'debit', receiver.name, sender.name) AS name, a.type, a.amount, a.transaction_date, a.transaction_type AS mode FROM (SELECT transactions.id AS transaction_id, transactions.amount, transactions.transaction_date, transactions.transaction_type, transactions.sender_id, transactions.receiver_id, IF(transactions.sender_id = ${req.user.id}, 'debit', 'credit') AS type FROM transactions WHERE (transactions.sender_id = ${req.user.id} OR transactions.receiver_id = ${req.user.id})) a, users sender, users receiver WHERE a.sender_id = sender.id AND a.receiver_id = receiver.id AND receiver.name LIKE "%${receiverName}%" AND receiver.email LIKE "%${receiverEmail}%" AND receiver.phone LIKE "%${receiverPhone}%" AND a.type LIKE "%${type}%"`
    if (fromDate) query += ` AND DATE(transaction_date) >= '${fromDate}'`
    if (toDate) query += ` AND DATE(transaction_date) <= '${toDate}'`
    if (month) query += ` AND MONTH(transaction_date) = '${month}'`
    query += `) b`
    if (userId) query += ` WHERE account_id = ${userId}`
    query += " ORDER BY transaction_date DESC;"
    results = await dbQuery(query)
    if (!results.length) {
        res.status(404).send("No Data Found")
        return true
    }
    data = results
    res.send(data)
})

router.get("/get-best-users", async (req, res) => {
    results = await dbQuery(
        `SELECT u.name, SUM(t.amount) AS total_transactions_amount FROM users u LEFT JOIN transactions t ON (u.id = t.sender_id OR u.id = t.receiver_id) group by u.id ORDER BY SUM(t.amount) DESC LIMIT 3;`
    )
    res.send(results)
})

router.post("/user/:userId/amount-per-month", auth("userId"), async (req, res) => {
    const month = req.body.month
    if (!month) {
        res.status(400).send("Please provide Month")
        return true
    }
    results = await dbQuery(
        `select sum(case when t.sender_id = ${req.user.id} then t.amount else null end) as total_amount_sent, sum(case when t.receiver_id = ${req.user.id} then t.amount else null end) as total_amount_received, avg(case when t.sender_id = ${req.user.id} then t.amount else null end) as average_amount_sent, avg(case when t.receiver_id = ${req.user.id} then t.amount else null end) as average_amount_received from transactions t where t.sender_id = ${req.user.id} or t.receiver_id = ${req.user.id} and month(t.transaction_date) = ${month};`
    )
    if (!results.length) {
        res.status(404).send("No Data Found")
        return true
    }
    data = results[0]
    res.send(data)
})

router.post("/max-amount-for-month", async (req, res) => {
    const month = req.body.month
    if (!month) {
        res.status(400).send("Please provide Month")
        return true
    }
    results = await dbQuery(
        `select t.id as transaction_id, s.name as sender, r.name as receiver, t.amount, t.transaction_date, t.transaction_type from transactions t, users s, users r where t.sender_id = s.id and t.receiver_id = r.id and amount = (select max(amount) from transactions where month(transaction_date) = ${month});`
    )
    if (!results.length) {
        res.status(404).send("No Data Found")
        return true
    }
    res.send(results)
})

router.post("/user/:userId/send-money", auth("userId"), async (req, res) => {
    const amount = req.body.amount
    const transactionMode = req.body.transactionMode
    const receiverIdentifier = req.body.receiverIdentifier
    const receiver = req.body.receiver
    const comments = req.body.comments ? "'" + req.body.comments + "'" : "''"
    if (!(amount && transactionMode)) {
        res.status(400).send("Please provide all transactions details")
        return true
    }
    if (Number(amount) > 10000) {
        res.status(400).send("Max Amount is 10000")
        return true
    }
    if (!(receiver && receiverIdentifier)) {
        res.status(400).send("Please provide Receiver Details")
        return true
    }
    currentBalance = Number(req.user.balance)
    newBalance = currentBalance - amount
    if (newBalance < 0) {
        res.status(400).send("You don't have enough balance")
        return true
    }
    if (receiverIdentifier == "accountId") {
        if (!typeof receiver == "number") {
            res.status(400).send("Account ID should be Number")
            return true
        }
        results = await dbQuery(`SELECT * FROM users WHERE id = ${receiver};`)
        if (!results.length) {
            res.status(400).send("Reciver Account ID does not exist")
            return true
        }
        receiverUser = results[0]
        if (receiverUser.id == req.user.id) {
            res.status(400).send("Cannot send money to same account")
            return true
        }
        await dbQuery(
            `INSERT INTO transactions (sender_id, receiver_id, amount, transaction_date, transaction_type, comments) VALUES (${req.user.id}, ${receiverUser.id}, ${amount}, now(), '${transactionMode}', ${comments});`
        )
        await dbQuery(`UPDATE users SET balance = ${newBalance} WHERE id = ${req.user.id}`)
        newReceiverBalance = Number(receiverUser.balance) + amount
        await dbQuery(
            `UPDATE users SET balance = ${newReceiverBalance} WHERE id = ${receiverUser.id}`
        )
    } else {
        results = await dbQuery(
            `SELECT * FROM users WHERE email = '${receiver}' OR phone = '${receiver}';`
        )
        if (results.length) {
            receiverUser = results[0]
            if (receiverUser.id == req.user.id) {
                res.status(400).send("Cannot send money to same account")
                return true
            }
            await dbQuery(
                `INSERT INTO transactions (sender_id, receiver_id, amount, transaction_date, transaction_type, comments) VALUES (${req.user.id}, ${receiverUser.id}, ${amount}, now(), '${transactionMode}', ${comments});`
            )
            await dbQuery(`UPDATE users SET balance = ${newBalance} WHERE id = ${req.user.id}`)
            newReceiverBalance = Number(receiverUser.balance) + amount
            await dbQuery(
                `UPDATE users SET balance = ${newReceiverBalance} WHERE id = ${receiverUser.id}`
            )
        } else {
            await dbQuery(
                `INSERT INTO transactions_in_progress (sender_id, receiver, receiver_identifier, amount, transaction_date, transaction_type, comments) VALUES (${req.user.id}, '${receiver}', '${receiverIdentifier}', ${amount}, null, '${transactionMode}', ${comments});`
            )
            await dbQuery(`UPDATE users SET balance = ${newBalance} WHERE id = ${req.user.id}`)
            res.send(
                "Account with given details doesn't exist. If user signs up in 15 days money will be transferred, else it will be refunded"
            )
            return true
        }
    }
    res.send("Transaction Completed Succesfully")
})

router.post("/user/:userId/request-money", auth("userId"), async (req, res) => {
    const amount = req.body.amount
    const receiverIdentifier = req.body.receiverIdentifier
    const receiver = req.body.receiver
    const comments = req.body.comments ? "'" + req.body.comments + "'" : "''"
    if (!amount) {
        res.status(400).send("Please provide amount")
        return true
    }
    if (Number(amount) > 10000) {
        res.status(400).send("Max Amount is 10000")
        return true
    }
    if (!(receiver && receiverIdentifier)) {
        res.status(400).send("Please provide Receiver Details")
        return true
    }
    if (receiverIdentifier == "accountId") {
        if (!typeof receiver == "number") {
            res.status(400).send("Account ID should be Number")
            return true
        }
        results = await dbQuery(`SELECT * FROM users WHERE id = ${receiver};`)
        if (!results.length) {
            res.status(400).send("Reciver Account ID does not exist")
            return true
        }
        receiverUser = results[0]
        if (receiverUser.id == req.user.id) {
            res.status(400).send("Cannot request money from same account")
            return true
        } else {
            await dbQuery(
                `INSERT INTO requests (sender_id, receiver_id, amount, comments, status) VALUES (${req.user.id}, ${receiverUser.id}, ${amount}, ${comments}, "active");`
            )
        }
    } else {
        results = await dbQuery(
            `SELECT * FROM users WHERE email = '${receiver}' OR phone = '${receiver}';`
        )
        if (!results.length) {
            res.status(404).send("Account with given details doesn't exist")
            return true
        }
        receiverUser = results[0]
        if (receiverUser.id == req.user.id) {
            res.status(400).send("Cannot request money from same account")
            return true
        }
        await dbQuery(
            `INSERT INTO requests (sender_id, receiver_id, amount, comments, status) VALUES (${req.user.id}, ${receiverUser.id}, ${amount}, ${comments}, "active");`
        )
    }
    res.send("Request Sent Successfully")
})

router.get("/user/:userId/requests", auth("userId"), async (req, res) => {
    const status = req.query.status ? req.query.status : ""
    results = await dbQuery(
        `SELECT r.id as request_id, r.created_at as requested_time, r.sender_id, s.name as request_sender, r.amount, r.comments, r.status FROM requests r, users s, users rec WHERE r.sender_id = s.id AND r.receiver_id = rec.id AND rec.id = ${req.user.id} AND r.status LIKE "%${status}%"`
    )
    res.send(results)
})

router.post("/user/:userId/accept-request", auth("userId"), async (req, res) => {
    const transactionMode = req.body.transactionMode
    const requestId = req.body.requestId
    const action = req.body.action
    const comments = req.body.comments ? "'" + req.body.comments + "'" : "''"
    if (!(requestId && action)) {
        res.status(400).send("Invalid Request")
        return true
    }
    results = await dbQuery(`SELECT * FROM requests WHERE id = ${requestId};`)
    if (!results.length) {
        res.status(400).send("Invalid Request ID")
        return true
    }
    requestObject = results[0]
    if (req.user.id != requestObject.receiver_id || requestObject.status != "active") {
        res.status(400).send("Invalid Transaction")
        return true
    }
    if (action == "reject") {
        await dbQuery(`UPDATE requests SET status = 'rejected' WHERE id = ${requestObject.id}`)
        res.send("Request Rejected Succesfully")
        return true
    }
    if (!transactionMode) {
        res.status(400).send("Please select mode of transaction")
        return true
    }
    amount = Number(requestObject.amount)
    currentBalance = Number(req.user.balance)
    newBalance = currentBalance - amount
    if (newBalance < 0) {
        res.status(400).send("You don't have enough balance to accept this request")
        return true
    }
    results = await dbQuery(`SELECT * FROM users WHERE id = ${requestObject.receiver_id};`)
    receiverUser = results[0]
    await dbQuery(
        `INSERT INTO transactions (sender_id, receiver_id, amount, transaction_date, transaction_type, comments) VALUES (${req.user.id}, ${requestObject.sender_id}, ${amount}, now(), '${transactionMode}', ${comments});`
    )
    await dbQuery(`UPDATE users SET balance = ${newBalance} WHERE id = ${req.user.id}`)
    newReceiverBalance = Number(receiverUser.balance) + amount
    await dbQuery(`UPDATE users SET balance = ${newReceiverBalance} WHERE id = ${receiverUser.id}`)
    await dbQuery(`UPDATE requests SET status = 'accepted' WHERE id = ${requestObject.id}`)
    res.send("Request Accepted Successfully")
})

module.exports = router
