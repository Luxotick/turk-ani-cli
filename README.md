# turk-ani-cli

A command-line interface for watching anime with Turkish subtitles. Stream your favorite anime directly from the terminal with an easy-to-use interface.

## Prerequisites

- Node.js (v14 or higher)
- MPV Player

## Installation

```bash
npm install -g turk-ani-cli
```

## Usage

```bash
tacli "One Piece"
```

![Usage](https://github.com/Luxotick/turk-ani-cli/blob/main/uh.gif?raw=true)

## Features

- 🔍 Search for anime with Turkish subtitles
- 📺 Stream directly using MPV player
- 🎯 Easy-to-use interactive CLI interface
- 🎮 Discord Rich Presence integration
- 📝 Multiple fansub group support

## To - Do
- quality selection (currently automatically selects the best quality)
- next episode command

## Discord Rich Presence

The application includes Discord integration that shows:
- Name of the anime that user is currrrrently watching
- Current episode
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
```
```bash
npm install
```

3. Run the development version:
```bash
npm start "One Piece"
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Legal Notice

This tool is for educational purposes only. Please support the original content creators and use official streaming services when available.

## License

MIT

## Author

[Luxotick](https://github.com/Luxotick)

# About

I made this project for learning web-scrapping and this is my first project that i used typescript. I also used selenium for collecting the data from the website because of the shitty coding in "turkanime.co", there is some random prints on the console that left from the old project. The admin of the turkanime website refused to give me an api key for this project and he blamed me for getting data with webscrapping and sharing it with him LOL.


![image](https://github.com/user-attachments/assets/fd05e3bb-dc35-480a-bb11-977a25c712f3)


"Are you sharing proof that you took videos without permission? :D"