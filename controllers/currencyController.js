const Currency= require("../models/currancyModel")
const { getOrganizationId } = require("../middleware/authmiddleware")

// check if any organization not set any currency by default save pkr currency
const addCurrency = async (req, res) => {
  try {
    const { code, symbol, name } = req.body
    if (!code || !symbol || !name) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const organizationId = req.organizationId || getOrganizationId(req)
    console.log("Adding currency for organization:", organizationId, { code, symbol, name })

    const currency = await Currency.findOneAndUpdate(
      { organizationId },
      { organizationId, code, symbol, name },
      { new: true, upsert: true },
    )

    if (req.io) {
      req.io.emit("currencyUpdated", currency)
    }

    res.json({ message: "Currency added successfully", currency })

  } catch (error) {
    console.error("Error adding currency:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}


const updateCurrency = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const { code, symbol, name } = req.body

    if (!code || !symbol || !name) {
      return res.status(400).json({ message: "All fields are required" })
    }

    console.log("[v0] Updating currency for organization:", organizationId, { code, symbol, name })

    // Use upsert to create the doc if it doesn't exist, scoped to organization
    const currency = await Currency.findOneAndUpdate(
      { organizationId },
      { organizationId, code, symbol, name },
      { new: true, upsert: true },
    )

    // Emit socket event if available
    if (req.io) {
      req.io.emit("currencyUpdated", currency)
    } else {
      console.warn("[v0] req.io not set, socket event not emitted")
    }

    res.json({ message: "Currency updated successfully", currency })
  } catch (error) {
    console.error("Error updating currency:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

const getCurrancy = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const currency = await Currency.findOne({ organizationId })

    if (!currency) {
      return res.status(404).json({ message: "Currency not found for this organization" })
    }

    res.json(currency)
  } catch (error) {
    console.error("Error fetching currency:", error)
    res.status(500).json({ message: "Server error" })
  }
}

module.exports = {
  updateCurrency,
  getCurrancy,
  addCurrency
}
