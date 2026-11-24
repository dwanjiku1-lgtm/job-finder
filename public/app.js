let allJobs = [];
const msgEl = document.getElementById('msg');
const gridEl = document.getElementById('grid');

function setMsg(text, type = '') {
    msgEl.textContent = text;
    msgEl.className = type ? `msg ${type}` : 'msg';
}

function render() {
    const term = document.getElementById('filter').value.trim().toLowerCase();
    const remoteOnly = document.getElementById('remote-filter').value === 'remote';
    const sortBy = document.getElementById('sort').value;

    const list = allJobs
       .filter((j) => {
        if (remoteOnly && !j.isRemote) return false;
        if (!term) return true;
        return (
            j.title.toLowerCase().includes(term) ||
            j.employer.toLowerCase().includes(term) ||
            j.location.toLowerCase().includes(term)
        );

       })
       .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'company') return a.employer.localeCompare(b.employer);
        if (sortBy === 'newest') return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
        return 0;
     });

gridEl.innerHTML = '';
if (!list.length) {
    gridEl.innerHTML = '<p>No jobs match your current view.</p>';
    return;
}

for (const job of list) {
    const card = document.createElement('article');
    card.className = 'card';
    const dateStr = job.postedAt ? new Date(job.postedAt).toLocaleDateString() : 'Recent';
    card.innerHTML = `
    <h3>${escapeHtml(job.title)}</h3>
    <div class="employer">${escapeHtml(job.employer)}</div>
    <div class="meta">${escapeHtml(job.location)} . ${escapeHtml(dateStr)}</div>
    <p class="summary">${escapeHtml(job.summary)}</p>
    ${job.applyLink ? `<a href="${escapeAttr(job.applyLink)}" target="_blank" rel="noopener noreferrer">Apply</a>` : ''}`;
    gridEl.appendChild(card);

}
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',

    }[c]))
}

function escapeAttr(url) {
    return /^https?:\/\//i.test(url) ? escapeHtml(url) : '#';
}

document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = document.getElementById('query').value.trim();
    const country = document.getElementById('country').value.trim() || 'us' ;
    setMsg('Searching Jsearch...', 'info');

    try {
        const res = await fetch('/api/jobs?query=' + encodeURIComponent(query) + '&country=' + encodeURIComponent(country));
        const data = await res.json();
        if (data.servedBy) {
            document.getElementById('server-label').textContent = `Served by: ${data.servedBy}`;
        }

        if (!res.ok) {
            allJobs = [];
            render();
            setMsg(data.error || 'Error fetching jobs.', 'error');
            return;
        }

        allJobs = data.jobs || [];
        render();
        setMsg(
            data.fromCache
            ? 'Loaded from cache (no extra API credit used).'
            : `Found ${allJobs.length} jobs.`,
            'info'
        );
    } catch (err) {
        console.error('Frontend error:', err);
        setMsg('Network error contacting server.', 'error');
    }
});

['filter', 'remote-filter', 'sort'].forEach((id) => {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
});

fetch('/health')
   .then((r) => r.json())
   .then((d) => {
    if (d.server) {
        document.getElementById('server-label').textContent = `Served by: ${d.server}`;
    }
   })
   .catch(() => {});