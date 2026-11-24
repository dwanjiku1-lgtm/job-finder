require('dotenv').config();
const path = require('path');
const os = require('os');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const HOSTNAME = os.hostname();
const cache = new Map(); 

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', server:HOSTNAME});
});

app.get('/api/jobs', async (req, res) => {
    const query = (req.query.query || '').trim();
    const country = (req.query.country || 'us').trim().toLowerCase();

    if (!query) {
        return res.status(400).json({error:'Please enter a search query.'});
    }

    if (!process.env.RAPIDAPI_KEY) {
        return res.status(500).json({error:'RAPIDAPI_KEY is misssing in .env.'});
    }
     const cacheKey = `${query.toLowerCase()}::${country}`;
     const cached = cache.get(cacheKey);
     if (cached && cached.expiresAt > Date.now()) {
        return res.json({ jobs:cached.jobs, fromCache: true, servedBy: HOSTNAME });
    }
    try {
     const url =
          'https://jsearch.p.rapidapi.com/search-v2?query=' + encodeURIComponent(query) +
          '&country=' + encodeURIComponent(country) +
          '&num_pages=1&date_posted=all';
        console.log('NEW CODE v3 - Requesting URL:', url);
     
        const response = await fetch(url, {
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
            signal: AbortSignal.timeout(20000),
        });

        const data = await response.json().catch(() => ({}));
        console.log('RapidAPI status:', response.status, 'keys:', Object.keys(data), 'sample:', JSON.stringify(data).slice(0,300));

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.message || `API request failed (HTTP ${response.status}).`,
                servedBy: HOSTNAME,
            });
        }
        const rawJobs = Array.isArray(data.data?.jobs)
            ? data.data.jobs
            : Array.isArray(data.data)
              ? data.data
              : [];
        const jobs = rawJobs.map((item, i) => ({     
            id: item.job_id || `${i}-${item.job_title}`,
            title: item.job_title || 'Untitled Role',
            employer: item.employer_name || 'Unknown Employer',
            location: item.job_is_remote
              ? 'Remote'
              : [item.job_city, item.job_country].filter(Boolean).join(', ') || 'Location unspecified',
            isRemote: Boolean(item.job_is_remote),
            postedAt: item.job_posted_at_datetime_utc || '',
            applyLink: item.job_apply_link || '',
            summary: (item.job_description || 'No description available.').slice(0, 200) + '...',

        }));

        cache.set(cacheKey, {jobs, expiresAt: Date.now() + 10 * 60 * 1000});
        res.json({ jobs, fromCache: false, servedBy: HOSTNAME });
     } catch (err){
        console.error('JSearch fetch error:', err);
        res.status(502).json({
            error: err.name === 'TimeoutError' ? 'API request timed out.' : 'Failed to  reach jSearch API.',
            servedBy: HOSTNAME,
        });
     }
    });

    app.listen(PORT, () => {
        console.log(`Server runnning on http://localhost:${PORT} (${HOSTNAME})`);
    });
