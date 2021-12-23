db = require("../db/mysql")

const dbQuery = async (query) => {
    try {
        const [rows, fields] = await db.promise().query(query)
        return rows
    } catch (error) {
        throw error
    }
}

module.exports = {
    dbQuery
}
