import { PongGame } from './PongGame';
import { GameState } from '../types';
import { Engine, Scene, ArcRotateCamera, Vector3, MeshBuilder, HemisphericLight, Color3, StandardMaterial, AbstractMesh, Color4 } from "@babylonjs/core";

interface PaddleMeshes {
    left?: AbstractMesh;
    right?: AbstractMesh;
    top?: AbstractMesh;
    bottom?: AbstractMesh;
}

export class baby3D {
    private engine!: Engine;
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private light!: HemisphericLight;
    private table!: AbstractMesh;
    private ball!: AbstractMesh;
    private paddles: PaddleMeshes = {};
    private mode: string;
    private initialized = false;
    private lastBallX?: number;
    private lastBallY?: number;
    private hasBallState: boolean = false;

    private values: {
        min: number,
        tableX: number,
        tableY: number,
        paddleX: number,
        paddleY: number,
        defaultPaddlePos: number,
        ballRadius: number,
        lift: number
    }

    constructor(private game?: PongGame) {
        this.mode = (game?.gameState.mode === '4P') ? '4P' : '2P';
        this.values = {
            min: 0,
            tableX: 400,
            tableY: (game?.gameState.mode === '4P') ? 400 : 200,
            paddleX: (game?.gameState.mode === '4P') ? 80 : 60,
            paddleY: 10,
            defaultPaddlePos: (game?.gameState.mode === '4P') ? 160 : 70,
            ballRadius: 10,
            lift: 2
        };
        if (this.game) this.attachGame(this.game);
    }

    attachGame(game: PongGame) {
        this.game = game;
        this.game.addStateListener(() => {
            const mode = (this.game?.gameState?.mode === '4P') ? '4P' : '2P';
            if (this.initialized && mode !== this.mode) {
                this.mode = mode;
                this.rebuild();
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
        this.engine.resize();

        this.camera = new ArcRotateCamera('cam', Math.PI / 2 + Math.PI, 1.05, 480, new Vector3(0, 0, 0), this.scene);
        this.camera.lowerBetaLimit = 0.6;
        this.camera.upperBetaLimit = 1.2;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        this.scene.clearColor = new Color4(0.04, 0.06, 0.10, 1);

        this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        this.light.intensity = 0.85;

        this.rebuild();

        const ballMat = new StandardMaterial('ballMat', this.scene);
        ballMat.diffuseColor = new Color3(1, 0.95, 0.4);
        this.ball = MeshBuilder.CreateSphere('ball', { diameter: this.values.ballRadius }, this.scene);
        this.ball.position = new Vector3(
            this.table.position.x,
            this.values.lift,
            this.table.position.z
        );
        this.ball.material = ballMat;
        this.lastBallX = this.values.tableX / 2;
        this.lastBallY = this.values.tableY / 2;
        this.hasBallState = false;

        this.initialized = true;

        this.engine.runRenderLoop(() => {
            try {
                this.syncFromGameState();
                this.scene.render();
            } catch (e) {
                console.error('[3D] Render loop error:', e);
            }
        });

        window.addEventListener('resize', () => this.engine.resize());
        if (canvas.parentElement && 'ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                this.engine.resize();
            });
            ro.observe(canvas.parentElement);
        }
        return this.scene;
    }

    private rebuild() {
        this.table?.dispose();

        const is4P = this.mode === '4P';
        this.values.tableY = is4P ? 400 : 200;
        this.values.paddleX = is4P ? 80 : 60;
        this.values.defaultPaddlePos = is4P ? 160 : 70;

        const tableMat = new StandardMaterial('tableMat', this.scene);
        tableMat.diffuseColor = new Color3(0.05, 0.45, 0.1);
        this.table = MeshBuilder.CreateGround('table', { width: this.values.tableX, height: this.values.tableY }, this.scene);
        this.table.position = new Vector3(0, 0, 0);
        this.table.material = tableMat;

        if (this.camera) this.camera.radius = is4P ? 600 : 480;

        this.rebuildPaddles();
    }

    private rebuildPaddles() {
        Object.values(this.paddles).forEach(m => m?.dispose());
        this.paddles = {};

        const makeMat = (name: string, color: Color3) => {
            const m = new StandardMaterial(name, this.scene);
            m.diffuseColor = color;
            return m;
        };
        
        const x = this.table.position.x;
        const z = this.table.position.z;
        const leftEdgeX = x - this.values.tableX / 2;
        const rightEdgeX = x + this.values.tableX / 2;
        const bottomEdgeZ = z - this.values.tableY / 2;
        const topEdgeZ = z + this.values.tableY / 2;

        if (this.mode === '2P') {
            const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            left.position = new Vector3(
                leftEdgeX + this.values.paddleY / 2,
                this.values.lift,
                topEdgeZ - (this.values.defaultPaddlePos + this.values.paddleX / 2)
            );
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            right.position = new Vector3(
                rightEdgeX - this.values.paddleY / 2,
                this.values.lift,
                topEdgeZ - (this.values.defaultPaddlePos + this.values.paddleX / 2)
            );
            right.material = makeMat('mat_right', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            this.paddles = { left, right };
        } else {
            const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            left.position = new Vector3(
                leftEdgeX + this.values.paddleY / 2,
                this.values.lift,
                topEdgeZ - (this.values.defaultPaddlePos + this.values.paddleX / 2)
            );
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const top = MeshBuilder.CreateBox('paddle_top', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
            top.position = new Vector3(
                leftEdgeX + (this.values.defaultPaddlePos + this.values.paddleX / 2),
                this.values.lift,
                topEdgeZ - this.values.paddleY / 2
            );
            top.material = makeMat('mat_top', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            right.position = new Vector3(
                rightEdgeX - this.values.paddleY / 2,
                this.values.lift,
                topEdgeZ - (this.values.defaultPaddlePos + this.values.paddleX / 2)
            );
            right.material = makeMat('mat_right', new Color3(1, 1, 0.2)); // Yellow - Player 3
            
            const bottom = MeshBuilder.CreateBox('paddle_bottom', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
            bottom.position = new Vector3(
                leftEdgeX + (this.values.defaultPaddlePos + this.values.paddleX / 2),
                this.values.lift,
                bottomEdgeZ + this.values.paddleY / 2
            );
            bottom.material = makeMat('mat_bottom', new Color3(0.2, 1, 0.2)); // Green - Player 4

            this.paddles = { left, top, right, bottom };
        }
    }

    private syncFromGameState() {
        if (!this.game) return;
        const state: GameState = this.game.gameState;
        if (!state) return;

        if (state.mode !== this.mode) {
            this.mode = state.mode;
            this.rebuild();
            this.lastBallX = this.values.tableX / 2;
            this.lastBallY = this.values.tableY / 2;
            this.hasBallState = false;
        }

        const x = this.table.position.x;
        const z = this.table.position.z;

        const leftEdgeX = x - this.values.tableX / 2;
        const rightEdgeX = x + this.values.tableX / 2;
        const bottomEdgeZ = z - this.values.tableY / 2;
        const topEdgeZ = z + this.values.tableY / 2;

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

        if (this.ball) {
            const bxRaw = Number((state as any).ballPosX);
            const byRaw = Number((state as any).ballPosY);
            const maxX = this.values.tableX;
            const maxY = this.values.tableY;
            const validBx = Number.isFinite(bxRaw) && bxRaw >= 0 && bxRaw <= maxX;
            const validBy = Number.isFinite(byRaw) && byRaw >= 0 && byRaw <= maxY;

            if (validBx && validBy) {
                this.lastBallX = bxRaw;
                this.lastBallY = byRaw;
                this.hasBallState = true;
            }

            const rx = (validBx ? bxRaw : (this.hasBallState ? (this.lastBallX as number) : maxX / 2));
            const ry = (validBy ? byRaw : (this.hasBallState ? (this.lastBallY as number) : maxY / 2));

            this.ball.position.x = leftEdgeX + rx;
            this.ball.position.z = topEdgeZ - ry;
            this.ball.position.y = this.values.lift;
        }

        const leftIdx = 0;
        const topIdx = this.mode === '4P' ? 1 : undefined;
        const rightIdx = this.mode === '2P' ? 1 : 2;
        const bottomIdx = this.mode === '4P' ? 3 : undefined;

        const left = Number.isFinite(Number(state.players?.[leftIdx]?.pos))
            ? Number(state.players?.[leftIdx]!.pos)
            : this.values.defaultPaddlePos;
        const top = (topIdx !== undefined && Number.isFinite(Number(state.players?.[topIdx]?.pos)))
            ? Number(state.players?.[topIdx]!.pos)
            : this.values.defaultPaddlePos;
        const right = Number.isFinite(Number(state.players?.[rightIdx]?.pos))
            ? Number(state.players?.[rightIdx]!.pos)
            : this.values.defaultPaddlePos;
        const bottom = (bottomIdx !== undefined && Number.isFinite(Number(state.players?.[bottomIdx]?.pos)))
            ? Number(state.players?.[bottomIdx]!.pos)
            : this.values.defaultPaddlePos;

        const paddleLen = this.values.paddleX;
        const paddleThick = this.values.paddleY;
        const lrMinZ = bottomEdgeZ + paddleLen / 2;
        const lrMaxZ = topEdgeZ - paddleLen / 2;
        const tbMinX = leftEdgeX + paddleLen / 2;
        const tbMaxX = rightEdgeX - paddleLen / 2;

        if (this.paddles.left != undefined) {
            this.paddles.left.position.x = leftEdgeX + paddleThick / 2;
            const centerZ = topEdgeZ - (left + paddleLen / 2);
            this.paddles.left.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
            this.paddles.left.position.y = this.values.lift;
        }
        if (this.paddles.top != undefined) {
            const centerX = leftEdgeX + (top + paddleLen / 2);
            this.paddles.top.position.x = clamp(centerX, tbMinX, tbMaxX);
            this.paddles.top.position.z = topEdgeZ - paddleThick / 2;
            this.paddles.top.position.y = this.values.lift;
        }
        if (this.paddles.right != undefined) {
            this.paddles.right.position.x = rightEdgeX - paddleThick / 2;
            const centerZ = topEdgeZ - (right + paddleLen / 2);
            this.paddles.right.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
            this.paddles.right.position.y = this.values.lift;
        }
        if (this.paddles.bottom != undefined) {
            const centerX = leftEdgeX + (bottom + paddleLen / 2);
            this.paddles.bottom.position.x = clamp(centerX, tbMinX, tbMaxX);
            this.paddles.bottom.position.z = bottomEdgeZ + paddleThick / 2;
            this.paddles.bottom.position.y = this.values.lift;
        }
    }
}