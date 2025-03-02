# Turk Ani CLI

A command-line interface for watching Turkish anime from turkanime.co with Discord Rich Presence integration.

## Features

- Search for anime by name
- Select episodes to watch
- Choose fansub groups
- Stream directly to MPV player
- Discord Rich Presence integration
- Next episode functionality
- Keyboard controls for playback

## Requirements

- Node.js >= 18.0.0
- MPV Player installed and in your PATH
- Chrome/Chromium (for Selenium)

## Installation

### Global Installation (Recommended)

```bash
npm install -g turk-ani-cli
```

### Local Installation

```bash
git clone https://github.com/Luxotick/turk-ani-cli.git
cd turk-ani-cli
npm install
npm run build
```

## Usage

### Global Installation

```bash
tacli "anime name"
```

### Local Installation

```bash
npm start "anime name"
```

## Keyboard Controls

While watching:
- **Space** - Play/Pause
- **Arrow Right** - Forward 5 seconds
- **Arrow Left** - Backward 5 seconds
- **Arrow Up** - Forward 60 seconds
- **Arrow Down** - Backward 60 seconds
- **N** - Next episode
- **Q** - Quit

## Project Structure

```
src/
├── core/           # Core application logic
├── services/       # Service modules
├── utils/          # Utility functions
└── index.ts        # Main entry point
```

## Development

### Building

```bash
npm run build
```

### Running in Development Mode

```bash
npm start "anime name"
```

## License

MIT

## Author

Luxotick

## About

This project was created for learning web-scraping and is my first TypeScript project. I used Selenium for collecting data from the website due to the complex structure of "turkanime.co". The project allows Turkish anime fans to easily stream content with a simple command-line interface.

![image](https://github.com/user-attachments/assets/fd05e3bb-dc35-480a-bb11-977a25c712f3)

"Are you sharing proof that you took videos without permission? :D"