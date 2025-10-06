const ProductSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    quantity: { 
      type: Number, 
      required: true 
    },
    price: { 
      type: Number, 
      required: true 
    },
    barcode: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    sellingPriceWithoutDiscount: { 
      type: Number, 
      required: true 
    },
    sellingPrice: { 
      type: Number, 
      required: true 
    },
    description: { 
      type: String, 
      required: false, 
      trim: true 
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: true,
    },
    hsCode: {
      type: String,
      required: true,
      match: [/^\d{4}\.\d{4}$/, 'HS Code must be in format XXXX.XXXX (8 digits total)'],
      trim: true
    },
    salesTax: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    customDuty: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    withholdingTax: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    marginPercent: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100 
    },
    discount: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    // ADD THESE FIELDS:
    exemptions: {
      spoNo: { 
        type: String, 
        trim: true, 
        default: '' 
      },
      scheduleNo: { 
        type: String, 
        trim: true, 
        default: '' 
      },
      itemNo: { 
        type: String, 
        trim: true, 
        default: '' 
      }
    },
    unitOfMeasurement: {
      type: String,
      required: true,
      enum: [
        'kg', 'g', 'ton', 'lb', 'oz',
        'liter', 'ml', 'gallon', 'quart',
        'meter', 'cm', 'mm', 'inch', 'ft', 'yard',
        'sqm', 'sqft', 'sqcm',
        'piece', 'dozen', 'pair', 'set',
        'box', 'pack', 'carton', 'bundle',
        'hour', 'day', 'month', 'year',
        'kwh', 'mwh',
        'other'
      ],
      default: 'piece'
    },
    image: { 
      type: String 
    },
    imagePublicId: { 
      type: String 
    },
  },
  { timestamps: true }
);
