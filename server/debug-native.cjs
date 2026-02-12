
const http = require('http');

const port = 5001;
const host = '0.0.0.0';

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Server is running on port ' + port + '\n');
});

server.listen(port, host, () => {
    console.log(`Native HTTP Server running at http://${host}:${port}/`);
});

server.on('error', (e) => {
    console.error('Server error:', e);
});
