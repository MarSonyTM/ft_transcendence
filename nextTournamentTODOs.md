# next todos for tournament implementation

[ ] add visualisation for matches (graph type)?
[ ] change reset button to keep aliases and players, just restart tournament (delete played matches and winners)?
[ ] add "new" button for new tournament?
[ ] add live tracking games?
[ ] use player alias OR existing users
[ ] create better matchmaking system (fair+balanced matching)
[ ] notify users about the next match

<!-- # WHAT TO DO IF IT DOESNT WORK -->
<!-- [check .env file]
[delete all the *-lock.json files]

sudo apt update && sudo apt upgrade

cd src/frontend && npm install && npm run build && cd ../backend && npm install && npm run build && cd ../.. -->


________________________________________________
- TODO: write tests
- TODO: try to make babylon/build faster

<!-- # babylon.js

## install babylon.js
npm install --save-dev @babylonjs/core
npm install --save-dev @babylonjs/inspector

## typescript support(? creates default tsconfig.json)
tsc --init
-> replace file content with:

{
  "compilerOptions": {
    "target": "es6",
    "module": "ESNext",
    "moduleResolution": "node",
    "noResolve": false,
    "noImplicitAny": false,
    "sourceMap": true,
    "preserveConstEnums":true,
    "lib": [
        "dom",
        "es6"
    ],
    "rootDir": "src"
  }
}

## install dev dependencies for webpack
npm install --save-dev typescript webpack ts-loader webpack-cli

## configure webpack
-> create webpack.config.js and insert:

const path = require("path");
const fs = require("fs");
const appDirectory = fs.realpathSync(process.cwd());

module.exports = {
    entry: path.resolve(appDirectory, "src/app.ts"), //path to the main .ts file
    output: {
        filename: "js/bundleName.js", //name for the javascript file that is created/compiled in memory
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    mode: "development",
};

## (close config file!) then install plugins
npm install --save-dev html-webpack-plugin
npm install --save-dev webpack-dev-server

## update configfile
const path = require("path");
const fs = require("fs");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const appDirectory = fs.realpathSync(process.cwd());

module.exports = {
    entry: path.resolve(appDirectory, "src/app.ts"), //path to the main .ts file
    output: {
        filename: "js/bundleName.js", //name for the js file that is created/compiled in memory
        clean: true,
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    devServer: {
        host: "0.0.0.0",
        port: 8080, //port that we're using for local host (localhost:8080)
        static: path.resolve(appDirectory, "public"), //tells webpack to serve from the public folder
        hot: true,
        devMiddleware: {
            publicPath: "/",
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: path.resolve(appDirectory, "public/index.html"),
        })
    ],
    mode: "development",
}; -->

# GAME IDEAS

DATABASE has all GAMES stored
	each GAME has >= 2 TEAMS (structs)
		each TEAM has >= 1 PLAYER (struct)
		-> team can be one player if all-against-all

-> define max amount of players that are possible
-> users will register, once done: count how many players are there
-> if even number: ask if they want to play in 2 teams or all-against-all
-> if odd: always all-against-all

GAME:
	- team structs
	- winner
	- scores
	- state
	- ball position

TEAM:
	- player structs
	- scores
	- message?

PLAYER:
	- number/id
	- alias
	- position (x and y?)
	- score
	- message?

# BABYLON.JS
Camera:
	UniversalCamera-> FPS-like movement, used for top-down or side view (2D!)
	FollowCamera -> follows target (=ball)
	for now: use ArcRotateCamera and dont call attachControl()
	prob use a fixed camera (dont attach controls and dont change position)

MeshBuilder:
	CreateBox -> paddles
	CreateShpere -> ball
	CreatePlane -> table
each mesh: position (x,y,z), rotation, scaling and material (color, texture, ...)

Materials:
	use: StandardMaterial (simple diffuse color)
	PBRMaterial (realistic, fancier)
	Color3(r, g, b) (define colors in 0-1 range)

Light:
	use: HemisphericLight (simple, ambient light)
	DirectionalLight (like the sun, casts shadows)
	PointLight (radiates from one point, like a lamp)

Game Loop:
	babylon automatically calls a render loop:
	update positions (ball, paddles)
	check collisions/scores => update current game logic by using intersectMesh() instead of manually checking for collisions
	render scene
	-> refreshes on every frame

GUI:
	for on-screen UI -> create text (score, time, messages) and buttons/panels
	-> drawn on top of the §D canvas

EXTRAS:
	- sound
	- physics (realistic bounce, gravity, friction)
	- textures
	- particles for effects like sparks or dust