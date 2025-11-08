require('dotenv').config();
const cheerio = require('cheerio')
const mongoose = require('mongoose');
const cron = require('node-cron');
const TIMEZONE = 'Asia/Kolkata';
let bulkWriteArr = []
async function scrapeWithCheerio(symbol) {
  try {
    const url = "https://www.google.com/finance/quote/symbol:NSE?hl=en".replace('symbol', symbol);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const scrapedData = [];
    $('.YMlKec.fxKbKc').each((index, element) => {
      scrapedData.push({
        index: index,
        text: $(element).text().trim(),
        html: $(element).html()
      });
      console.log($(element).text().trim()?.slice(1), "$(element).text().trim()?.slice(1)?"?.replace(",",""))
      bulkWriteArr.push({
        symbol: symbol, value: Number($(element).text().trim()?.slice(1)?.replaceAll(",",""))
      })
    });
    return scrapedData;
  } catch (error) {
    console.error('Error scraping data:', error);
    return null;
  }
}

const bulkWrite = async() => {
  bulkWriteArr.forEach(async(item) => {
    await Symbol.updateOne({Symbol:item?.symbol}, {$push:{Values:item?.value}})
  })
}
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
connectDB()

const symbolSchema = new mongoose.Schema({
  Symbol: {
    type: String,
  },
  Values:[Number],
  Rank:Number,
  Name: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});
const Symbol = mongoose.model('symbol', symbolSchema);
const calldata = async () => {
  const result = await Symbol.find().skip(0).limit(25)
  result.forEach(async(item, index) => {
    const symbol = item['Symbol']
    await scrapeWithCheerio(symbol)
    if (index == 24) {
     bulkWrite()
    }
  })
  
}

function isWithinTimeRange() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return (hours == 9 && minutes >= 15) || (hours == 10 && minutes <=25);
}

cron.schedule('*/5 * * * *', () => {
    if (isWithinTimeRange()) {
        calldata()   
    } 
}, {
    timezone: TIMEZONE
});
