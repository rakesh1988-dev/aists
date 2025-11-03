require('dotenv').config();
const exp = require('express')
const cheerio = require('cheerio')
const mongoose = require('mongoose');
const cron = require('node-cron');

let bulkWriteArr = []
async function scrapeWithCheerio(symbol) {
  try {
    const url = "https://www.google.com/finance/quote/symbol:NSE?hl=en".replace('symbol', symbol);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // Load HTML into Cheerio
    const $ = cheerio.load(html);

    // Find elements with the specified class name
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

    console.log('Scraped data:', scrapedData);
    return scrapedData;

  } catch (error) {
    console.error('Error scraping data:', error);
    return null;
  }
}

const bulkWrite = async() => {

  bulkWriteArr.forEach(async(item) => {
    console.log(item,"item")
    const response = await Symbol.updateOne({Symbol:item?.symbol}, {$push:{Values:item?.value}})
    console.log(response)
  })
}

const resetValues = async() => {
  await Symbol.updateMany({},{Values:[]})
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
  const result = await Symbol.find()?.limit(200)
  result.forEach(async(item, index) => {
    const symbol = item['Symbol']
    await scrapeWithCheerio(symbol)
    if (index == 199) {
     bulkWrite()
    }
  })
  
}


const updateRank = async() => {

  const start = new Date()
  console.log(start,"start")
  const respone = await Symbol.find();
  respone.forEach(async(item)=> {
    let rank = 1
    const arr = item?.Values;
    for (let x =1; x < (arr.length-1); x++){
      if (arr[x] < arr[x -1]) {
        rank = rank + 1
      }
    }
    await Symbol.updateOne({Symbol:item.Symbol},{$set:{Rank:rank}});
  })
  const end = new Date()
  console.log(end,"end")
}




function isWithinTimeRange() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Check if time is between 12:30 and 13:00
    return (hours == 9 && minutes >= 15) || (hours == 10 && minutes <=25);
}

function getCurrentISTTime() {
    return new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false
    });
}
const TIMEZONE = 'Asia/Kolkata';
cron.schedule('*/10 * * * *', () => {
    const currentIST = getCurrentISTTime();
    
    if (isWithinTimeRange()) {
        console.log(`🏃 [${currentIST}] Running query in IST timezone...`);
        
        // Execute your query
        calldata()
       
    } else {
        console.log(`💤 [${currentIST}] Outside scheduled time window (12:30-13:00 IST)`);
    }
}, {
    timezone: TIMEZONE
});

cron.schedule('0 9 * * 1-5', () => {
    console.log('Executing daily task at 9 AM IST');
    resetValues()
}, {
    timezone: "Asia/Kolkata"
});

cron.schedule('35 10 * * 1-5', () => {
    updateRank()
}, {
    timezone: "Asia/Kolkata"
});


//console.log('Cron job scheduled to run from 9:15 AM to 10:30 AM every 5 minutes in IST.');

const app = exp()
app.use(exp.json())
app.get("/health", (req,res)=> {
  return res.send("Working!")
})
app.get("/data", async(req,res)=> {
  const resp = await Symbol.find({},{Symbol:1,Name:1,_id:0}).sort({Rank:1})
  return res.send(resp)
})
app.listen(3000,()=> console.log('started server'))