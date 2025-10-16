import { PongGame } from './PongGame';
import { GameState } from '../types';
import { Engine, Scene, ArcRotateCamera, Vector3, MeshBuilder, HemisphericLight, Color3, StandardMaterial, AbstractMesh, Color4 } from "@babylonjs/core";

type Mode = '2P' | '4P';

interface PaddleMeshes {
    left?: AbstractMesh;
    right?: AbstractMesh;
    top?: AbstractMesh;
    bottom?: AbstractMesh;
}

const yLift = 2;
const paddleX = 10;
const paddleY = 10;

const paddleZ2P = 40;
const tableWidth2P = 400;
const tableHeight2P = 200;
const paddleInitPos2P = tableWidth2P / 2 - paddleX / 2;

const paddleZ4P = 80;
const tableWidth4P = 400;
const tableHeight4P = 400;
const paddleInitPos4P = tableWidth4P / 2 - paddleX / 2;

export class baby3D {
    private engine!: Engine;
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private light!: HemisphericLight;
    private table!: AbstractMesh;
    private ball!: AbstractMesh;
    private borders: { north?: AbstractMesh; south?: AbstractMesh; east?: AbstractMesh; west?: AbstractMesh } = {};

    private paddles: PaddleMeshes = {};
    private currentMode: Mode = '2P';
    private initialized = false;

    constructor(private game?: PongGame) {
        if (this.game) this.attachGame(this.game);
    }

    attachGame(game: PongGame) {
        this.game = game;
        this.game.addStateListener(() => {
            const mode = (this.game?.gameState?.mode === '4P') ? '4P' : '2P';
            if (this.initialized && mode !== this.currentMode) {
                this.rebuildTable(mode);
                this.rebuildPaddles(mode);
            }
        });
    }

    async createScene(): Promise<Scene> {
        let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'renderCanvas';
            document.body.appendChild(canvas);
        }
        this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new Scene(this.engine);

        this.camera = new ArcRotateCamera('cam', Math.PI / 2 + Math.PI, 1.05, 480, new Vector3(0, 0, 0), this.scene);
        this.camera.lowerBetaLimit = 0.6;
        this.camera.upperBetaLimit = 1.2;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        this.scene.clearColor = new Color4(0.04, 0.06, 0.10, 1);

        this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        this.light.intensity = 0.85;

        // Build table and borders based on mode
        const initialMode: Mode = (this.game?.gameState?.mode === '4P') ? '4P' : '2P';
        this.rebuildTable(initialMode);

        const ballMat = new StandardMaterial('ballMat', this.scene);
        ballMat.diffuseColor = new Color3(1, 0.95, 0.4);
        this.ball = MeshBuilder.CreateSphere('ball', { diameter: 10 }, this.scene);
        this.ball.position = new Vector3(0, 10, 0);
        this.ball.material = ballMat;

        this.rebuildPaddles(initialMode);
        this.currentMode = initialMode;
        this.initialized = true;

        this.engine.runRenderLoop(() => {
            this.syncFromGameState();
            this.scene.render();
        });
        window.addEventListener('resize', () => this.engine.resize());
        return this.scene;
    }

    private rebuildTable(mode: Mode) {
        this.table?.dispose();
        this.borders.north?.dispose();
        this.borders.south?.dispose();
        this.borders.east?.dispose();
        this.borders.west?.dispose();

        const tableMat = new StandardMaterial('tableMat', this.scene);
        tableMat.diffuseColor = new Color3(0.05, 0.45, 0.1);
        const borderMat = new StandardMaterial('borderMat', this.scene);
        borderMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
        const thickness = 0.5;

        if (mode === '4P') {
            this.table = MeshBuilder.CreateGround('table', { width: tableWidth4P, height: tableHeight4P, subdivisions: 1 }, this.scene);
            this.table.material = tableMat;

            const north = MeshBuilder.CreateBox('northBorder', { width: tableWidth4P, height: 0.1, depth: thickness }, this.scene);
            north.position = new Vector3(0, 0.1, tableHeight4P / 2);
            north.material = borderMat;

            const south = north.clone('southBorder');
            south.position.z = -tableHeight4P / 2;

            const west = MeshBuilder.CreateBox('westBorder', { width: thickness, height: 0.1, depth: tableHeight4P }, this.scene);
            west.position = new Vector3(-tableWidth4P / 2, 0.1, 0);
            west.material = borderMat;

            const east = west.clone('eastBorder');
            east.position.x = tableWidth4P / 2;

            this.borders = { north, south, east, west };

            if (this.camera) this.camera.radius = 600;
        } else {
            this.table = MeshBuilder.CreateGround('table', { width: tableWidth2P, height: tableHeight2P, subdivisions: 1 }, this.scene);
            this.table.material = tableMat;

            const north = MeshBuilder.CreateBox('northBorder', { width: tableWidth2P, height: 0.1, depth: thickness }, this.scene);
            north.position = new Vector3(0, 0.1, tableHeight2P / 2);
            north.material = borderMat;

            const south = north.clone('southBorder');
            south.position.z = -tableHeight2P / 2;

            const west = MeshBuilder.CreateBox('westBorder', { width: thickness, height: 0.1, depth: tableHeight2P }, this.scene);
            west.position = new Vector3(-tableWidth2P / 2, 0.1, 0);
            west.material = borderMat;

            const east = west.clone('eastBorder');
            east.position.x = tableWidth2P / 2;

            this.borders = { north, south, east, west };

            if (this.camera) this.camera.radius = 480;
        }
        this.currentMode = mode;
    }

    private rebuildPaddles(mode: Mode) {
        Object.values(this.paddles).forEach(m => m?.dispose());
        this.paddles = {};
        this.currentMode = mode;

        const makeMat = (name: string, color: Color3) => {
            const m = new StandardMaterial(name, this.scene);
            m.diffuseColor = color;
            return m;
        };
        
        if (mode === '2P') {
            const left = MeshBuilder.CreateBox('paddle_left', { width: paddleX, height: paddleY, depth: paddleZ2P }, this.scene);
            left.position = new Vector3(-paddleInitPos2P, yLift, 0);
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const right = MeshBuilder.CreateBox('paddle_right', { width: paddleX, height: paddleY, depth: paddleZ2P }, this.scene);
            right.position = new Vector3(paddleInitPos2P, yLift, 0);
            right.material = makeMat('mat_right', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            this.paddles = { left, right };
        } else {
            const left = MeshBuilder.CreateBox('paddle_left', { width: paddleX, height: paddleY, depth: paddleZ4P }, this.scene);
            left.position = new Vector3(-paddleInitPos4P, yLift, 0);
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const top = MeshBuilder.CreateBox('paddle_top', { width: paddleZ4P, height: paddleY, depth: paddleX }, this.scene);
            top.position = new Vector3(0, yLift, paddleInitPos4P);
            top.material = makeMat('mat_top', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            const right = MeshBuilder.CreateBox('paddle_right', { width: paddleX, height: paddleY, depth: paddleZ4P }, this.scene);
            right.position = new Vector3(paddleInitPos4P, yLift, 0);
            right.material = makeMat('mat_right', new Color3(1, 1, 0.2)); // Yellow - Player 3
            
            const bottom = MeshBuilder.CreateBox('paddle_bottom', { width: paddleZ4P, height: paddleY, depth: paddleX }, this.scene);
            bottom.position = new Vector3(0, yLift, -paddleInitPos4P);
            bottom.material = makeMat('mat_bottom', new Color3(0.2, 1, 0.2)); // Green - Player 4

            this.paddles = { left, top, right, bottom };
        }
    }

    private syncFromGameState() {
        if (!this.game) return;
        const gs: GameState = this.game.gameState;
        if (!gs) return;

        const desiredMode: Mode = (gs.mode === '4P') ? '4P' : '2P';
        if (desiredMode !== this.currentMode) this.rebuildPaddles(desiredMode);

        const halfTableWidth = (this.currentMode === '4P') ? tableWidth4P / 2 : tableWidth2P / 2;
        const halfTableHeight = (this.currentMode === '4P') ? tableHeight4P / 2 : tableHeight2P / 2;
        const toWorldX = (canvasX: number) => (canvasX ?? 2 * halfTableWidth) - halfTableWidth;
        const toWorldZ = (canvasY: number) => halfTableHeight - (canvasY ?? halfTableHeight);

        // Clamp helpers for table bounds considering paddle sizes
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const clamp4PYMin = -halfTableHeight + paddleZ4P / 2;
        const clamp4PYMax = halfTableHeight - paddleZ4P / 2;
        const clamp4PXMin = -halfTableWidth + paddleZ4P / 2;
        const clamp4PXMax = halfTableWidth - paddleZ4P / 2;
        const clamp2PMin = -halfTableHeight + paddleZ2P / 2;
        const clamp2PMax = halfTableHeight - paddleZ2P / 2;


        if (this.ball) {
            this.ball.position.x = toWorldX(gs.ballPosX ?? 200);
            this.ball.position.z = toWorldZ(gs.ballPosY ?? 100);
            this.ball.position.y = 6;
        }

        if (this.currentMode === '2P') { 
            const leftTopY = gs.players?.[0]?.pos ?? tableHeight2P / 2 - paddleZ2P / 2;
            const rightTopY = gs.players?.[1]?.pos ?? tableHeight2P / 2 - paddleZ2P / 2;
            const leftCenterZ = toWorldZ(leftTopY + paddleZ2P / 2);
            const rightCenterZ = toWorldZ(rightTopY + paddleZ2P / 2);
            if (this.paddles.left) {
                this.paddles.left.position.z = clamp(leftCenterZ, clamp2PMin, clamp2PMax);
                this.paddles.left.position.y = 2;
            }
            if (this.paddles.right) {
                this.paddles.right.position.z = clamp(rightCenterZ, clamp2PMin, clamp2PMax);
                this.paddles.right.position.y = 2;
            }
        } else {
            const leftPaddleTopY = gs.players?.[0]?.pos ?? tableHeight4P / 2 - paddleZ4P / 2;
            const topPaddleLeftX = gs.players?.[1]?.pos ?? tableWidth4P / 2 - paddleZ4P / 2;
            const rightPaddleTopY = gs.players?.[2]?.pos ?? tableHeight4P / 2 - paddleZ4P / 2;
            const bottomPaddleLeftX = gs.players?.[3]?.pos ?? tableWidth4P / 2 - paddleZ4P / 2;

            if (this.paddles.top) {
                const cx = toWorldX(topPaddleLeftX + paddleZ4P / 2);
                this.paddles.top.position.x = clamp(cx, clamp4PXMin, clamp4PXMax);
                this.paddles.top.position.y = yLift;
            }
            if (this.paddles.bottom) {
                const cx = toWorldX(bottomPaddleLeftX + paddleZ4P / 2);
                this.paddles.bottom.position.x = clamp(cx, clamp4PXMin, clamp4PXMax);
                this.paddles.bottom.position.y = yLift;
            }
            if (this.paddles.right) {
                const cz = toWorldZ(rightPaddleTopY + paddleZ4P / 2);
                this.paddles.right.position.z = clamp(cz, clamp4PYMin, clamp4PYMax);
                this.paddles.right.position.y = yLift;
            }
            if (this.paddles.left) {
                const cz = toWorldZ(leftPaddleTopY + paddleZ4P / 2);
                this.paddles.left.position.z = clamp(cz, clamp4PYMin, clamp4PYMax);
                this.paddles.left.position.y = yLift;
            }
        }
    }
}