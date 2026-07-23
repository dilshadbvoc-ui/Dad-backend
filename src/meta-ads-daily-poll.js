const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'PASTE_YOUR_LONG_LIVED_TOKEN_HERE';
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_XXXXXXXXXXXX'; // include "act_" prefix
const GRAPH_API_VERSION = 'v19.0';

const LOG_FILE = path.join(__dirname, 'meta-api-usage-log.txt');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

async function callMarketingAPI() {
  try {
    const insightsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${AD_ACCOUNT_ID}/insights?fields=spend,impressions,reach,ctr&date_preset=last_7d&access_token=${ACCESS_TOKEN}`;
    const insightsRes = await fetch(insightsUrl);
    const insightsData = await insightsRes.json();

    if (insightsData.error) {
      log(`ERROR (insights): ${JSON.stringify(insightsData.error)}`);
    } else {
      log(`SUCCESS (insights): fetched ${insightsData.data ? insightsData.data.length : 0} record(s)`);
    }
  
    const campaignsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${AD_ACCOUNT_ID}/campaigns?fields=name,status,objective&access_token=${ACCESS_TOKEN}`;
    const campaignsRes = await fetch(campaignsUrl);
    const campaignsData = await campaignsRes.json();

    if (campaignsData.error) {
      log(`ERROR (campaigns): ${JSON.stringify(campaignsData.error)}`);
    } else {
      log(`SUCCESS (campaigns): fetched ${campaignsData.data ? campaignsData.data.length : 0} record(s)`);
    }

  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
  }
}


callMarketingAPI();


setInterval(callMarketingAPI, 24 * 60 * 60 * 1000);

log('Meta Ads daily polling script started. Will run every 24 hours.');
