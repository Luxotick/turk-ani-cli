# turk-ani-cli

A command-line interface for watching anime with Turkish subtitles. Stream your favorite anime directly from the terminal with an easy-to-use interface.

## Prerequisites

- Node.js (v18 or higher)
- MPV Player

## Installation

```bash
npm install -g turk-ani-cli
```

## Usage

```bash
# Search for an anime
tacli "One Piece"

# Or use npm start for development
npm start "One Piece"
```

![Usage](https://github.com/Luxotick/turk-ani-cli/blob/main/uh.gif?raw=true)

## Features

- 🔍 Search for anime with Turkish subtitles
- 📺 Stream directly using MPV player
- 🎯 Easy-to-use interactive CLI interface
- 🎮 Discord Rich Presence integration
- 📝 Multiple fansub group support
- ⏭️ Next episode functionality (press 'N' during playback)
- 🎬 Automatic playback of highest quality available

## MPV Player Controls

During playback, you can use the following controls:
- **Space** - Play/Pause
- **Arrow Right** - Forward 5 seconds
- **Arrow Left** - Backward 5 seconds
- **Arrow Up** - Forward 60 seconds
- **Arrow Down** - Backward 60 seconds
- **N** - Play next episode
- **Q** - Quit

## Discord Rich Presence

The application includes Discord integration that shows:
- Name of the anime that user is currently watching
- Current episode number
- Direct link to watch the episode
- Link to the project

## Dependencies

- MPV Player (required for playback)

## Installation Guide

### 1. Install MPV Player

#### Windows
```bash
winget install mpv
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt install mpv
```

#### macOS
```bash
brew install mpv
```

### 2. Install the CLI
```bash
npm install -g turk-ani-cli
```

## Building from Source

1. Clone the repository:
```bash
git clone https://github.com/Luxotick/turk-ani-cli.git
```

2. Install dependencies:
```bash
cd turk-ani-cli
npm install
```

3. Run the development version:
```bash
npm start "One Piece"
```

4. Build for distribution:
```bash
npm run build
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Legal Notice

This tool is for educational purposes only. Please support the original content creators and use official streaming services when available.

## License

MIT

## Author

[Luxotick](https://github.com/Luxotick)

## About

This project was created for learning web-scraping and is my first TypeScript project. I used Selenium for collecting data from the website due to the complex structure of "turkanime.co". The project allows Turkish anime fans to easily stream content with a simple command-line interface.

![image](https://github.com/user-attachments/assets/fd05e3bb-dc35-480a-bb11-977a25c712f3)

"Are you sharing proof that you took videos without permission? :D"