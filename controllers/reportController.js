const { Order } = require("../models/orderModel");
const { Products } = require("../models/productModel");
const { Category } = require("../models/categoryModel");
const { Subcategory } = require("../models/subcategoryModel");

// Helper functions
const getStartOfDay = (date, offsetDays = 0) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};

const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getStartOfYear = (date) => {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getSalesSummary = async (req, res) => {
  try {
    const { hsCode } = req.query;
    const now = new Date();
    const endToday = getEndOfDay(now);

    const startToday = getStartOfDay(now);
    const start7Days = getStartOfDay(now, 6);
    const start30Days = getStartOfDay(now, 29);
    const start365Days = getStartOfDay(now, 364);

    async function aggregateMetrics(fromDate, toDate) {
      let matchStage = { date: { $gte: fromDate, $lte: toDate } };

      const result = await Order.aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        ...(hsCode ? [{ $match: { "items.hsCode": hsCode } }] : []),
        {
          $group: {
            _id: null,
            totalSales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
            totalItems: { $sum: "$items.quantity" },
            totalSalesTax: { $sum: { $multiply: ["$items.salesTaxAmount", "$items.quantity"] } },
            totalCustomDuty: { $sum: { $multiply: ["$items.customDutyAmount", "$items.quantity"] } },
            totalWithholdingTax: { $sum: { $multiply: ["$items.withholdingTaxAmount", "$items.quantity"] } },
            totalMargin: { $sum: { $multiply: ["$items.marginAmount", "$items.quantity"] } },
            totalDiscount: { $sum: { $multiply: ["$items.discountAmount", "$items.quantity"] } },
            totalCostPrice: { $sum: { $multiply: ["$items.costPrice", "$items.quantity"] } },
          }
        }
      ]);

      const transactions = await Order.countDocuments({
        ...matchStage,
        ...(hsCode ? { "items.hsCode": hsCode } : {})
      });

      const totalSales = result[0]?.totalSales || 0;
      const itemsSold = result[0]?.totalItems || 0;
      const avgSale = transactions > 0 ? totalSales / transactions : 0;

      return {
        totalSales,
        transactions,
        avgSale,
        itemsSold,
        totalSalesTax: result[0]?.totalSalesTax || 0,
        totalCustomDuty: result[0]?.totalCustomDuty || 0,
        totalWithholdingTax: result[0]?.totalWithholdingTax || 0,
        totalMargin: result[0]?.totalMargin || 0,
        totalDiscount: result[0]?.totalDiscount || 0,
        totalCostPrice: result[0]?.totalCostPrice || 0,
      };
    }

    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = getStartOfDay(now, i);
      const dayEnd = getEndOfDay(dayStart);
      const pipeline = [
        { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
        { $unwind: "$items" }
      ];
      if (hsCode) {
        pipeline.push({ $match: { "items.hsCode": hsCode } });
      }
      pipeline.push({
        $group: { _id: null, totalSales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } } }
      });
      const result = await Order.aggregate(pipeline);
      dailyTrend.push(result[0]?.totalSales || 0);
    }

    const weeklyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekStartMonday = getStartOfWeek(weekStart);
      const weekEnd = new Date(weekStartMonday);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const pipeline = [
        { $match: { date: { $gte: weekStartMonday, $lte: weekEnd } } },
        { $unwind: "$items" }
      ];
      if (hsCode) {
        pipeline.push({ $match: { "items.hsCode": hsCode } });
      }
      pipeline.push({
        $group: { _id: null, totalSales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } } }
      });
      const result = await Order.aggregate(pipeline);
      weeklyTrend.push(result[0]?.totalSales || 0);
    }

    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      const pipeline = [
        { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
        { $unwind: "$items" }
      ];
      if (hsCode) {
        pipeline.push({ $match: { "items.hsCode": hsCode } });
      }
      pipeline.push({
        $group: { _id: null, totalSales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } } }
      });
      const result = await Order.aggregate(pipeline);
      monthlyTrend.push(result[0]?.totalSales || 0);
    }

    const yearlyTrend = [];
    for (let i = 4; i >= 0; i--) {
      const yearStart = new Date(now.getFullYear() - i, 0, 1);
      const yearEnd = new Date(now.getFullYear() - i, 11, 31);
      yearEnd.setHours(23, 59, 59, 999);

      const pipeline = [
        { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
        { $unwind: "$items" }
      ];
      if (hsCode) {
        pipeline.push({ $match: { "items.hsCode": hsCode } });
      }
      pipeline.push({
        $group: { _id: null, totalSales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } } }
      });
      const result = await Order.aggregate(pipeline);
      yearlyTrend.push(result[0]?.totalSales || 0);
    }

    const today = await aggregateMetrics(startToday, endToday);
    const weekly = await aggregateMetrics(start7Days, endToday);
    const monthly = await aggregateMetrics(start30Days, endToday);
    const yearly = await aggregateMetrics(start365Days, endToday);

    const currentWeekStart = getStartOfWeek(now);
    const currentWeek = await aggregateMetrics(currentWeekStart, endToday);

    const currentMonthStart = getStartOfMonth(now);
    const currentMonth = await aggregateMetrics(currentMonthStart, endToday);

    const currentYearStart = getStartOfYear(now);
    const currentYear = await aggregateMetrics(currentYearStart, endToday);

    const topProductsPipeline = [
      { $match: { date: { $gte: start30Days, $lte: endToday } } },
      { $unwind: "$items" }
    ];
    if (hsCode) {
      topProductsPipeline.push({ $match: { "items.hsCode": hsCode } });
    }
    topProductsPipeline.push(
      {
        $group: {
          _id: "$items.name",
          price: { $first: "$items.sellingPrice" },
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
          hsCode: { $first: "$items.hsCode" }
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    );

    const topProductsAgg = await Order.aggregate(topProductsPipeline);

    const salesTargets = Math.max(monthly.totalSales * 1.1, 50000);
    const avgSalesTargets = Math.max(monthly.totalSales * 0.9, 40000);
    const prevAvgSalesTargets = avgSalesTargets * 0.85;
    const avgItemsTarget = Math.max((monthly.itemsSold / (monthly.transactions || 1)) * 1.05, 3);
    const prevAvgItemsTarget = avgItemsTarget * 0.95;

    res.json({
      filteredByHsCode: hsCode || null,

      // Today's metrics
      todaySales: today.totalSales,
      todayTransactions: today.transactions,
      todayItemsSold: today.itemsSold,
      todayAvgSale: today.avgSale,
      todaySalesTax: today.totalSalesTax,
      todayCustomDuty: today.totalCustomDuty,
      todayWithholdingTax: today.totalWithholdingTax,
      todayMargin: today.totalMargin,
      todayDiscount: today.totalDiscount,
      todayCostPrice: today.totalCostPrice,

      // Weekly metrics
      weeklySales: weekly.totalSales,
      weeklyTransactions: weekly.transactions,
      weeklyItemsSold: weekly.itemsSold,
      weeklyAvgSale: weekly.avgSale,
      weeklySalesTax: weekly.totalSalesTax,
      weeklyCustomDuty: weekly.totalCustomDuty,
      weeklyWithholdingTax: weekly.totalWithholdingTax,
      weeklyMargin: weekly.totalMargin,
      weeklyDiscount: weekly.totalDiscount,
      weeklyCostPrice: weekly.totalCostPrice,

      // Current week metrics
      currentWeekSales: currentWeek.totalSales,
      currentWeekTransactions: currentWeek.transactions,
      currentWeekItemsSold: currentWeek.itemsSold,
      currentWeekAvgSale: currentWeek.avgSale,

      // Monthly metrics
      monthlySales: monthly.totalSales,
      monthlyTransactions: monthly.transactions,
      monthlyItemsSold: monthly.itemsSold,
      monthlyAvgSale: monthly.avgSale,
      monthlySalesTax: monthly.totalSalesTax,
      monthlyCustomDuty: monthly.totalCustomDuty,
      monthlyWithholdingTax: monthly.totalWithholdingTax,
      monthlyMargin: monthly.totalMargin,
      monthlyDiscount: monthly.totalDiscount,
      monthlyCostPrice: monthly.totalCostPrice,

      // Current month metrics
      currentMonthSales: currentMonth.totalSales,
      currentMonthTransactions: currentMonth.transactions,
      currentMonthItemsSold: currentMonth.itemsSold,
      currentMonthAvgSale: currentMonth.avgSale,

      // Yearly metrics
      yearlySales: yearly.totalSales,
      yearlyTransactions: yearly.transactions,
      yearlyItemsSold: yearly.itemsSold,
      yearlyAvgSale: yearly.avgSale,
      yearlySalesTax: yearly.totalSalesTax,
      yearlyCustomDuty: yearly.totalCustomDuty,
      yearlyWithholdingTax: yearly.totalWithholdingTax,
      yearlyMargin: yearly.totalMargin,
      yearlyDiscount: yearly.totalDiscount,
      yearlyCostPrice: yearly.totalCostPrice,

      // Current year metrics
      currentYearSales: currentYear.totalSales,
      currentYearTransactions: currentYear.transactions,
      currentYearItemsSold: currentYear.itemsSold,
      currentYearAvgSale: currentYear.avgSale,

      salesTrend: {
        daily: dailyTrend,
        weekly: weeklyTrend,
        monthly: monthlyTrend,
        yearly: yearlyTrend,
      },

      topProducts: topProductsAgg.map(p => ({
        name: p._id,
        price: p.price,
        sales: p.sales,
        revenue: p.revenue,
        hsCode: p.hsCode,
      })),

      salesTargets,
      avgSalesTargets,
      prevAvgSalesTargets,
      avgItemsTarget,
      prevAvgItemsTarget,
      prevAvgItemsPerSale: Math.max((monthly.itemsSold / (monthly.transactions || 1)) * 0.92, 2.5),
    });
  } catch (err) {
    console.error("Error fetching sales summary:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getProductSalesOverview = async (req, res) => {
  try {
    const {
      period = "monthly",
      startDate,
      endDate,
      lowThreshold = 5,
      page = 1,
      limit = 20,
      search = "",
      category = "all",
      hsCode = ""
    } = req.query;

    const now = new Date();
    let fromDate, toDate;

    switch (period) {
      case "daily":
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
        fromDate = getStartOfYear(now);
        toDate = getEndOfDay(now);
        break;
      case "custom":
        fromDate = new Date(startDate);
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
        break;
      default:
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productFilter = {};
    if (search) {
      productFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } }
      ];
    }
    if (hsCode) {
      productFilter.hsCode = hsCode;
    }

    // Fetch all products with ALL fields including tax and pricing info
    const allProducts = await Products.find(productFilter, {
      name: 1,
      price: 1,
      barcode: 1,
      sellingPrice: 1,
      sellingPriceWithoutDiscount: 1,
      hsCode: 1,
      salesTax: 1,
      customDuty: 1,
      withholdingTax: 1,
      marginPercent: 1,
      discount: 1
    }).lean();

    const salesPipeline = [
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" }
    ];
    if (hsCode) {
      salesPipeline.push({ $match: { "items.hsCode": hsCode } });
    }
    salesPipeline.push({
      $group: {
        _id: "$items.name",
        totalSold: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
        totalSalesTax: { $sum: { $multiply: ["$items.salesTaxAmount", "$items.quantity"] } },
        totalCustomDuty: { $sum: { $multiply: ["$items.customDutyAmount", "$items.quantity"] } },
        totalWithholdingTax: { $sum: { $multiply: ["$items.withholdingTaxAmount", "$items.quantity"] } },
        totalMargin: { $sum: { $multiply: ["$items.marginAmount", "$items.quantity"] } },
        totalDiscount: { $sum: { $multiply: ["$items.discountAmount", "$items.quantity"] } },
      }
    });

    const salesAgg = await Order.aggregate(salesPipeline);

    const salesMap = {};
    salesAgg.forEach((s) => {
      salesMap[s._id] = {
        totalSold: s.totalSold,
        totalRevenue: s.totalRevenue,
        totalSalesTax: s.totalSalesTax,
        totalCustomDuty: s.totalCustomDuty,
        totalWithholdingTax: s.totalWithholdingTax,
        totalMargin: s.totalMargin,
        totalDiscount: s.totalDiscount,
      };
    });

    // Map products with ALL fields
    const result = allProducts.map((prod) => ({
      name: prod.name,
      price: prod.price || 0,
      sellingPrice: prod.sellingPrice || 0,
      sellingPriceWithoutDiscount: prod.sellingPriceWithoutDiscount || 0,
      barcode: prod.barcode,
      hsCode: prod.hsCode,
      salesTax: prod.salesTax || 0,
      customDuty: prod.customDuty || 0,
      withholdingTax: prod.withholdingTax || 0,
      marginPercent: prod.marginPercent || 0,
      discount: prod.discount || 0,
      totalSold: salesMap[prod.name]?.totalSold || 0,
      totalRevenue: salesMap[prod.name]?.totalRevenue || 0,
      totalSalesTax: salesMap[prod.name]?.totalSalesTax || 0,
      totalCustomDuty: salesMap[prod.name]?.totalCustomDuty || 0,
      totalWithholdingTax: salesMap[prod.name]?.totalWithholdingTax || 0,
      totalMargin: salesMap[prod.name]?.totalMargin || 0,
      totalDiscount: salesMap[prod.name]?.totalDiscount || 0,
    }));

    let filteredProducts = result;
    if (category === "unsold") {
      filteredProducts = result.filter(p => p.totalSold === 0);
    } else if (category === "low") {
      filteredProducts = result.filter(p => p.totalSold > 0 && p.totalSold <= Number(lowThreshold));
    } else if (category === "high") {
      filteredProducts = result.filter(p => p.totalSold > Number(lowThreshold));
    }

    const totalCount = filteredProducts.length;
    const paginatedProducts = filteredProducts.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum);

    const unsoldProducts = result.filter((p) => p.totalSold === 0);
    const lowSellingProducts = result.filter((p) => p.totalSold > 0 && p.totalSold <= Number(lowThreshold));
    const topProduct = result.reduce((acc, curr) => (curr.totalSold > (acc?.totalSold || 0) ? curr : acc), null);

    res.json({
      from: fromDate,
      to: toDate,
      filteredByHsCode: hsCode || null,
      products: paginatedProducts,
      unsoldProducts: unsoldProducts.slice(0, 10),
      lowSellingProducts: lowSellingProducts.slice(0, 10),
      topProduct,
      summary: {
        totalProducts: result.length,
        unsoldCount: unsoldProducts.length,
        lowSellingCount: lowSellingProducts.length,
        highSellingCount: result.filter(p => p.totalSold > Number(lowThreshold)).length
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Error in getProductSalesOverview:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getProductsSoldBetweenDates = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20, search = "", hsCode = "" } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "Both 'from' and 'to' dates are required" });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      return res.status(400).json({ message: "'From' date cannot be after 'to' date" });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productFilter = {};
    if (search) {
      productFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } }
      ];
    }
    if (hsCode) {
      productFilter.hsCode = hsCode;
    }

    // Fetch all products with ALL fields
    const allProducts = await Products.find(productFilter, {
      name: 1,
      price: 1,
      sellingPrice: 1,
      sellingPriceWithoutDiscount: 1,
      barcode: 1,
      hsCode: 1,
      salesTax: 1,
      customDuty: 1,
      withholdingTax: 1,
      marginPercent: 1,
      discount: 1
    }).lean();

    const salesPipeline = [
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" }
    ];
    if (hsCode) {
      salesPipeline.push({ $match: { "items.hsCode": hsCode } });
    }
    salesPipeline.push({
      $group: {
        _id: "$items.name",
        totalSold: { $sum: "$items.quantity" },
        totalRevenue: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
        totalSalesTax: { $sum: { $multiply: ["$items.salesTaxAmount", "$items.quantity"] } },
        totalCustomDuty: { $sum: { $multiply: ["$items.customDutyAmount", "$items.quantity"] } },
        totalWithholdingTax: { $sum: { $multiply: ["$items.withholdingTaxAmount", "$items.quantity"] } },
        totalMargin: { $sum: { $multiply: ["$items.marginAmount", "$items.quantity"] } },
        totalDiscount: { $sum: { $multiply: ["$items.discountAmount", "$items.quantity"] } },
      }
    });

    const salesAgg = await Order.aggregate(salesPipeline);

    const salesMap = {};
    salesAgg.forEach((s) => {
      salesMap[s._id] = {
        totalSold: s.totalSold,
        totalRevenue: s.totalRevenue,
        totalSalesTax: s.totalSalesTax,
        totalCustomDuty: s.totalCustomDuty,
        totalWithholdingTax: s.totalWithholdingTax,
        totalMargin: s.totalMargin,
        totalDiscount: s.totalDiscount,
      };
    });

    const result = allProducts.map((prod) => ({
      name: prod.name,
      price: prod.price || 0,
      sellingPrice: prod.sellingPrice || 0,
      sellingPriceWithoutDiscount: prod.sellingPriceWithoutDiscount || 0,
      barcode: prod.barcode,
      hsCode: prod.hsCode,
      salesTax: prod.salesTax || 0,
      customDuty: prod.customDuty || 0,
      withholdingTax: prod.withholdingTax || 0,
      marginPercent: prod.marginPercent || 0,
      discount: prod.discount || 0,
      totalSold: salesMap[prod.name]?.totalSold || 0,
      totalRevenue: salesMap[prod.name]?.totalRevenue || 0,
      totalSalesTax: salesMap[prod.name]?.totalSalesTax || 0,
      totalCustomDuty: salesMap[prod.name]?.totalCustomDuty || 0,
      totalWithholdingTax: salesMap[prod.name]?.totalWithholdingTax || 0,
      totalMargin: salesMap[prod.name]?.totalMargin || 0,
      totalDiscount: salesMap[prod.name]?.totalDiscount || 0,
    }));

    result.sort((a, b) => b.totalSold - a.totalSold);

    const totalCount = result.length;
    const paginatedProducts = result.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      from: fromDate,
      to: toDate,
      filteredByHsCode: hsCode || null,
      products: paginatedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Error in getProductsSoldBetweenDates:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAvailableHsCodes = async (req, res) => {
  try {
    const hsCodes = await Products.distinct("hsCode");
    const orderHsCodes = await Order.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.hsCode" } },
      { $project: { _id: 0, hsCode: "$_id" } }
    ]);

    const allHsCodes = [...new Set([
      ...hsCodes.filter(code => code),
      ...orderHsCodes.map(item => item.hsCode).filter(code => code)
    ])].sort();

    res.json({
      hsCodes: allHsCodes,
      count: allHsCodes.length
    });
  } catch (error) {
    console.error("Error fetching HS codes:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCategoriesWithHsCodes = async (req, res) => {
  try {
    const categories = await Category.find({}, { categoryName: 1, hsCode: 1, _id: 1 }).sort({ categoryName: 1 });

    res.json({
      success: true,
      categories: categories.map(cat => ({
        id: cat._id,
        name: cat.categoryName,
        hsCode: cat.hsCode
      }))
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const getSubcategoriesByCategoryWithHsCodes = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const subcategories = await Subcategory.find(
      { category: categoryId },
      { subcategoryName: 1, hsCode: 1, _id: 1 }
    ).sort({ subcategoryName: 1 });

    res.json({
      success: true,
      subcategories: subcategories.map(sub => ({
        id: sub._id,
        name: sub.subcategoryName,
        hsCode: sub.hsCode
      }))
    });
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const getSalesByHsCode = async (req, res) => {
  try {
    const { hsCode, period = "monthly", startDate, endDate } = req.query;

    if (!hsCode) {
      return res.status(400).json({ message: "HS Code is required" });
    }

    const now = new Date();
    let fromDate, toDate;

    switch (period) {
      case "daily":
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
        fromDate = getStartOfYear(now);
        toDate = getEndOfDay(now);
        break;
      case "custom":
        fromDate = new Date(startDate);
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
        break;
      default:
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
    }

    const result = await Order.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" },
      { $match: { "items.hsCode": hsCode } },
      {
        $group: {
          _id: "$items.name",
          productName: { $first: "$items.name" },
          hsCode: { $first: "$items.hsCode" },
          totalSold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
          avgPrice: { $avg: "$items.sellingPrice" },
          totalSalesTax: { $sum: { $multiply: ["$items.salesTaxAmount", "$items.quantity"] } },
          totalCustomDuty: { $sum: { $multiply: ["$items.customDutyAmount", "$items.quantity"] } },
          totalWithholdingTax: { $sum: { $multiply: ["$items.withholdingTaxAmount", "$items.quantity"] } },
          totalMargin: { $sum: { $multiply: ["$items.marginAmount", "$items.quantity"] } },
          totalDiscount: { $sum: { $multiply: ["$items.discountAmount", "$items.quantity"] } },
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    const summary = result.reduce((acc, item) => ({
      totalSold: acc.totalSold + item.totalSold,
      totalRevenue: acc.totalRevenue + item.totalRevenue,
      productCount: acc.productCount + 1,
      totalSalesTax: acc.totalSalesTax + item.totalSalesTax,
      totalCustomDuty: acc.totalCustomDuty + item.totalCustomDuty,
      totalWithholdingTax: acc.totalWithholdingTax + item.totalWithholdingTax,
      totalMargin: acc.totalMargin + item.totalMargin,
      totalDiscount: acc.totalDiscount + item.totalDiscount,
    }), {
      totalSold: 0,
      totalRevenue: 0,
      productCount: 0,
      totalSalesTax: 0,
      totalCustomDuty: 0,
      totalWithholdingTax: 0,
      totalMargin: 0,
      totalDiscount: 0,
    });

    res.json({
      hsCode,
      period,
      dateRange: {
        from: fromDate,
        to: toDate
      },
      summary,
      products: result.map(item => ({
        name: item.productName,
        hsCode: item.hsCode,
        totalSold: item.totalSold,
        totalRevenue: item.totalRevenue,
        avgPrice: item.avgPrice,
        totalSalesTax: item.totalSalesTax,
        totalCustomDuty: item.totalCustomDuty,
        totalWithholdingTax: item.totalWithholdingTax,
        totalMargin: item.totalMargin,
        totalDiscount: item.totalDiscount,
      }))
    });
  } catch (error) {
    console.error("Error in getSalesByHsCode:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTopProductsByPeriod = async (req, res) => {
  try {
    const { period, page = 1, limit = 10, sortBy = "sales", hsCode } = req.query;
    if (!period || !["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({ message: "Invalid or missing period" });
    }

    const now = new Date();
    let fromDate, toDate;

    switch (period) {
      case "daily":
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
        fromDate = getStartOfYear(now);
        toDate = getEndOfDay(now);
        break;
      default:
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortField = sortBy === "revenue" ? "revenue" : "sales";
    const sortOrder = sortBy === "low" ? 1 : -1;

    const pipeline = [
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" }
    ];

    if (hsCode) {
      pipeline.push({ $match: { "items.hsCode": hsCode } });
    }

    pipeline.push(
      {
        $group: {
          _id: "$items.name",
          price: { $first: "$items.sellingPrice" },
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
          hsCode: { $first: "$items.hsCode" }
        }
      },
      { $sort: { [sortField]: sortOrder } },
      {
        $facet: {
          products: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }]
        }
      }
    );

    const topProductsAgg = await Order.aggregate(pipeline);

    const products = topProductsAgg[0].products.map(p => ({
      name: p._id,
      price: p.price,
      sales: p.sales,
      revenue: p.revenue,
      hsCode: p.hsCode,
    }));

    const totalCount = topProductsAgg[0].totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      period,
      filteredByHsCode: hsCode || null,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      products,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      }
    });
  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getSalesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, hsCode } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      return res.status(400).json({ message: "Start date cannot be after end date" });
    }

    const pipeline = [
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" }
    ];

    if (hsCode) {
      pipeline.push({ $match: { "items.hsCode": hsCode } });
    }

    pipeline.push({
      $facet: {
        totalSales: [
          { $group: { _id: null, total: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } } } }
        ],
        itemsSold: [
          { $group: { _id: null, totalItems: { $sum: "$items.quantity" } } }
        ],
        dailyBreakdown: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              sales: { $sum: { $multiply: ["$items.sellingPrice", "$items.quantity"] } },
              items: { $sum: "$items.quantity" }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    });

    const result = await Order.aggregate(pipeline);

    const transactions = await Order.countDocuments({
      date: { $gte: fromDate, $lte: toDate },
      ...(hsCode ? { "items.hsCode": hsCode } : {})
    });

    const totalSales = result[0].totalSales[0]?.total || 0;
    const itemsSold = result[0].itemsSold[0]?.totalItems || 0;
    const avgSale = transactions > 0 ? totalSales / transactions : 0;
    const dailyBreakdown = result[0].dailyBreakdown || [];

    res.json({
      filteredByHsCode: hsCode || null,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      summary: {
        totalSales,
        transactions,
        itemsSold,
        avgSale,
      },
      dailyBreakdown,
    });
  } catch (error) {
    console.error("Error fetching sales by date range:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getBestProductByDate = async (req, res) => {
  try {
    const { date, hsCode } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required" });
    const dayStart = getStartOfDay(new Date(date));
    const dayEnd = getEndOfDay(new Date(date));

    const pipeline = [
      { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
      { $unwind: "$items" }
    ];

    if (hsCode) {
      pipeline.push({ $match: { "items.hsCode": hsCode } });
    }

    pipeline.push(
      {
        $group: {
          _id: "$items.name",
          totalSold: { $sum: "$items.quantity" },
          price: { $first: "$items.sellingPrice" },
          hsCode: { $first: "$items.hsCode" }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 1 }
    );

    const agg = await Order.aggregate(pipeline);
    res.json({
      date,
      filteredByHsCode: hsCode || null,
      bestProduct: agg[0] || null
    });
  } catch (error) {
    console.error("Error in getBestProductByDate:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getSalesSummary,
  getTopProductsByPeriod,
  getSalesByDateRange,
  getProductSalesOverview,
  getBestProductByDate,
  getProductsSoldBetweenDates,
  getAvailableHsCodes,
  getSalesByHsCode,
  getCategoriesWithHsCodes,
  getSubcategoriesByCategoryWithHsCodes,
};
