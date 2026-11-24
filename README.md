# Job Search App

A web application that helps people find job openings. Users search by role or location, then filter and sort the results. The app is deployed on two web servers behind a load balancer.

- **Live site (via load balancer):** https://wanjiku.tech
- **Demo video (max 2 minutes):** `ADD_YOUR_VIDEO_LINK_HERE`
- **Repository:** https://github.com/dwanjiku1-lgtm/job-finder

---

## Features

- **Search** for jobs by role or location (for example `software engineering remote`) and pick a country code.
- **Filter** the loaded results by title, company or location, and show remote jobs only.
- **Sort** results by title, company or newest.
- **Apply links** that open the original job posting in a new tab.
- **Server label** in the top right ("Served by: ...") showing which web server answered, which makes load balancing visible.
- **Caching:** repeated searches are served from an in-memory cache for 10 minutes, which saves API credits and speeds up responses.
- **Error handling:** clear messages for an empty query, a missing API key, API errors, API timeouts and network failures.
- **Safe rendering:** all job text is HTML-escaped before it is placed on the page, and apply links are only accepted if they start with `http://` or `https://` (protection against XSS).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js 20, Express |
| External API | JSearch (RapidAPI) |
| Process manager | pm2 |
| Web servers | Nginx (reverse proxy to the Node app) |
| Load balancer | HAProxy |

---

## Project structure

```
job-finder/
├── server.js          # Express server and /api/jobs, /health routes
├── package.json
├── .env.example       # Template for environment variables (no real key)
├── .gitignore         # Excludes node_modules and .env
└── public/
    ├── index.html     # Page markup
    ├── app.js         # Frontend logic: search, filter, sort, render
    └── styles.css     # Brown and cream theme
```

---

## API used

This project uses the **JSearch API** by *letscrape* through RapidAPI.

- API page: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
- RapidAPI documentation: https://docs.rapidapi.com/

Credit and thanks to the JSearch API developers for the job data.

The API key is read from an environment variable on the server. It is never sent to the browser and is never committed to the repository.

---

## Run locally

### Requirements

- Node.js 18 or newer (the server uses the built-in `fetch`)
- A RapidAPI account with a subscription to the JSearch API (the free plan works)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/dwanjiku1-lgtm/job-finder.git
cd job-finder

# 2. Install dependencies
npm install

# 3. Create your .env file from the template
cp .env.example .env
# then open .env and set RAPIDAPI_KEY to your own key

# 4. Start the server
npm start
```

Open http://localhost:3000, type a search such as `software engineering`, and press **Search**.

### Environment variables

| Variable | Description | Example |
|---|---|---|
| `RAPIDAPI_KEY` | Your RapidAPI key for JSearch | `your_key_here` |
| `PORT` | Port the Node server listens on | `3000` |

### Endpoints

| Route | Description |
|---|---|
| `GET /` | The web app |
| `GET /api/jobs?query=...&country=us` | Searches jobs through JSearch (cached for 10 minutes) |
| `GET /health` | Returns `{"status":"ok","server":"<hostname>"}`, used by the load balancer health check |

---

## Deployment

The app runs on two web servers (Web01 and Web02) and one load balancer (Lb01).

| Server | Role | IP |
|---|---|---|
| 7425-web-01 | Application server | 18.133.77.133 |
| 7425-web-02 | Application server | 35.178.176.93 |
| 7425-lb-01 | Load balancer (HAProxy) | 18.171.203.231 |

All three run Ubuntu 20.04 on ARM (aarch64). The domain `wanjiku.tech` points to the load balancer.

### 1. Deploy the app on Web01 and Web02

Repeat these steps on **both** web servers.

**Connect:**

```bash
ssh -i <path-to-private-key> ubuntu@<WEB_SERVER_IP>
```

**Install git, Node.js 20 and pm2** (Nginx was already installed):

```bash
sudo apt update
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

**Get the code and install dependencies:**

```bash
git clone https://github.com/dwanjiku1-lgtm/job-finder.git app
cd app
npm install
```

**Create the `.env` file** (it is not in the repository, so it is created on each server):

```bash
printf 'RAPIDAPI_KEY=YOUR_KEY\nPORT=3000\n' > .env
```

**Start the app with pm2 and keep it running after reboots:**

```bash
pm2 start server.js --name jobsearch
pm2 save
pm2 startup      # then run the "sudo env PATH=..." command it prints
pm2 save
```

**Check it:**

```bash
curl http://localhost:3000/health
# {"status":"ok","server":"7425-web-01"}   (or 7425-web-02)
```

### 2. Configure Nginx on each web server

Nginx listens on port 80 and forwards requests to the Node app on port 3000. This replaces the default page that came with the server.

```bash
sudo tee /etc/nginx/sites-available/default > /dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
}
EOF
sudo nginx -t
sudo systemctl restart nginx
```

Test by opening `http://<WEB_SERVER_IP>` in a browser. The app should load and show its own server name.

### 3. Configure the load balancer (Lb01)

HAProxy on Lb01 distributes traffic between the two web servers using round robin. The relevant part of `/etc/haproxy/haproxy.cfg`:

```haproxy
frontend http_front
    bind *:80
    mode http
    http-request redirect scheme https code 301
    default_backend http_back

backend http_back
    mode http
    balance roundrobin
    server 7425-web-01 18.133.77.133:80 check
    server 7425-web-02 35.178.176.93:80 check

frontend https_front
    bind *:443 ssl crt /etc/haproxy/certs/www.wanjiku.tech.pem
    mode http
    http-request set-header X-Forwarded-Proto https
    default_backend http_back
```

What this does:

- **`frontend http_front`** accepts traffic on port 80 and redirects it to HTTPS.
- **`frontend https_front`** accepts HTTPS traffic on port 443 using the TLS certificate for the domain, then passes requests to the backend.
- **`backend http_back`** uses `balance roundrobin` to alternate between Web01 and Web02.
- **`check`** enables health checks, so HAProxy stops sending traffic to a server that is down and resumes when it is back.

Validate and apply the configuration:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl status haproxy
```

### 4. Updating the app later

Edit code on a local machine, push to GitHub, then pull on each web server:

```bash
cd ~/app
git pull
pm2 restart jobsearch    # only needed if server.js or package.json changed
```

Changes to files in `public/` (HTML, CSS, frontend JavaScript) do not need a restart.

---

## Testing the load balancer

**1. Round robin.** Request the health route several times through the load balancer:

```bash
for i in 1 2 3 4; do curl -sLk http://18.171.203.231/health; echo; done
```

Result:

```
{"status":"ok","server":"7425-web-01"}
{"status":"ok","server":"7425-web-02"}
{"status":"ok","server":"7425-web-01"}
{"status":"ok","server":"7425-web-02"}
```

The two servers alternate. In the browser, refreshing https://wanjiku.tech several times changes the "Served by" label between `7425-web-01` and `7425-web-02`.

**2. Failover.** On Web01, stop the app with `pm2 stop jobsearch`. After about 10 seconds the health check marks Web01 as down, and every request is answered by Web02. Start it again with `pm2 start jobsearch` and traffic is shared again.

**3. Application check through the load balancer.** Search for `software engineering` on https://wanjiku.tech and confirm that job cards load, filtering and sorting work, and Apply links open.

**Note on caching:** the cache lives in memory on each server. The same search can be a cache miss on one server and a cache hit on the other. This is expected and does not affect correctness.

---

## Challenges and how I solved them

1. **Search returned no results because the query was sent as literal text.**
   The logs showed `query=${encodeURIComponent(query)}` being sent to the API. The frontend `fetch` URL was missing the `$` in its template literal, so nothing was interpolated. I rewrote the URL with string concatenation (`'/api/jobs?query=' + encodeURIComponent(query)`), which removed the problem.

2. **"Network error contacting server" with no clue why.**
   A bare `catch {}` was hiding the real errors. Adding `catch (err) { console.error(err); ... }` showed the browser console messages, which exposed two JavaScript bugs: `alljobs` vs `allJobs` (variable names are case sensitive) and a wrong `allJobs.jobs.length` that should have been `allJobs.length`.

3. **"API request timed out" on broader searches.**
   JSearch can take longer than the 7 second limit I first set. I raised the timeout to 20 seconds.

4. **Old server code kept running.**
   A missing `try {` caused a syntax error, so Node refused to start the new file while an old copy still held port 3000. Fixing the syntax and stopping the old process solved it.

5. **Lost SSH access to the servers.**
   The servers only accepted the original key registered on my profile, and its private half was not in my normal `.ssh` folder. The comment at the end of the public key (`root@<12 hex characters>`) showed it was created inside a Docker container. I found the container, recovered the key, and logged in. Lesson: back up private keys outside containers.

6. **Port 80 showed the school's default page instead of the app.**
   Nginx was still serving the default site. Replacing the default config with a reverse proxy to port 3000 fixed it.

7. **Duplicate HAProxy frontend.**
   The load balancer already had a working HAProxy configuration. Appending a second `http_front` block made the config invalid, so I removed it and used the existing round-robin backend, which already pointed at both servers with health checks.

8. **Secrets handling.**
   `.env` is in `.gitignore`, so the API key never reaches GitHub. It is created directly on each server instead.

---

## Security notes

- API key stored only in `.env` on the server and excluded from git.
- All job content is HTML-escaped before rendering, and apply links must be `http` or `https` URLs.
- Search input is validated on the server (empty queries are rejected) and URL-encoded when calling the API.
- Requests to the external API have a timeout, and failures return clear messages instead of crashing the server.

---



## Author

David Ngure Wanjiku