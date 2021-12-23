const { dbQuery } = require("../common/utils")

const auth = (roleKey) => {
    return async (req, res, next) => {
        var userId = req.params[roleKey]
        req.userId = userId
        let data = await dbQuery(`select * from users where id = ${req.userId}`)
        if (!data.length) {
            res.status(404).send("User not found")
            return True
        }
        req.user = data[0]
        next()
    }
}

module.exports = auth
