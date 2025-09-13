const axios = require('axios');

const API_KEY = process.env.YOUTUBE_API_KEY;

async function youtubeSearch(query) {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY not configured');
  const url = 'https://www.googleapis.com/youtube/v3/search';
  const params = {
    key: API_KEY,
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 6
  };

  const { data } = await axios.get(url, { params, timeout: 8000 });
  // map to safe shape
  return (data.items || []).map((item) => ({
    id: item.id?.videoId,
    title: item.snippet?.title,
    channel: item.snippet?.channelTitle,
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
    publishedAt: item.snippet?.publishedAt
  }));
}

module.exports = { youtubeSearch };
