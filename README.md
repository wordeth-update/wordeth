# Wordeth - Social Music Experience

Wordeth is a social video platform that combines live video calling with music lyrics and merchandise customization. Users can participate in group video calls while discussing their favorite songs and creating custom merchandise with song lyrics.

## Features

- 6-person video calling with WebRTC
- Live topic banners for video calls
- Lyrics search using Musixmatch API
- Custom merchandise designer
- Mobile-responsive design
- Modern UI with micro-animations

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/wordeth.git
cd wordeth
```

2. Get your Musixmatch API key:
- Visit [Musixmatch Developer](https://developer.musixmatch.com/)
- Sign up and get your API key
- Replace `YOUR_API_KEY` in `js/main.js` with your actual API key

3. Set up a local development server:
You can use any simple HTTP server. Here are a few options:

Using Python:
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

Using Node.js:
```bash
npx http-server
```

4. Open your browser and navigate to:
```
http://localhost:8000
```

## Project Structure

```
wordeth/
├── index.html          # Home page
├── video-call.html     # Video call page
├── lyrics.html         # Lyrics search page
├── merch.html         # Merchandise customization page
├── 404.html           # Error page
├── css/
│   ├── styles.css     # Main styles
│   └── animations.css # Animation styles
├── js/
│   └── main.js        # Main JavaScript
└── assets/
    ├── logo.svg       # Wordeth logo
    └── mic-icon.svg   # Microphone icon
```

## Color Scheme

- Black: #000000
- Purple Dark: #553555
- Purple Light: #755B69
- Purple Accent: #5F0E82
- Mint: #96C5B0

## Browser Support

- Chrome (recommended for best WebRTC support)
- Firefox
- Safari
- Edge

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC for video calling functionality
- Musixmatch for lyrics API
- Font Awesome for icons 