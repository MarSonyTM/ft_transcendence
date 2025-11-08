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
        console.log('🎨 [3D] Starting scene creation...');
        
        // Check WebGL support first
        if (!this.checkWebGLSupport()) {
            throw new Error('WebGL is not supported in this browser');
        }
        
        // Wait a bit for DOM to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Find or create canvas
        let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
        
        if (!canvas) {
            console.log('⚠️ [3D] Canvas not found, creating new one');
            canvas = document.createElement('canvas');
            canvas.id = 'renderCanvas';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvas.style.touchAction = 'none'; // Prevent touch scrolling
            
            // Find the right container to append to
            const gameContainer = document.getElementById('gameContainer') 
                || document.querySelector('.game-container')
                || document.body;
            
            gameContainer.appendChild(canvas);
            console.log('✅ [3D] Canvas created and appended to:', gameContainer.id || 'body');
        }
        
        // Create BabylonJS engine with error handling
        try {
            console.log('🎨 [3D] Creating BabylonJS engine...');
            this.engine = new Engine(canvas, true, { 
                preserveDrawingBuffer: true, 
                stencil: true,
                antialias: true,
                powerPreference: "high-performance"
            });
            console.log('✅ [3D] Engine created successfully');
        } catch (error) {
            console.error('❌ [3D] Failed to create BabylonJS engine:', error);
            throw new Error(`WebGL initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Create scene
        this.scene = new Scene(this.engine);
        this.engine.resize();
        console.log('✅ [3D] Scene created');

        // Setup camera
        this.camera = new ArcRotateCamera(
            'cam', 
            Math.PI / 2 + Math.PI, 
            1.05, 
            480, 
            new Vector3(0, 0, 0), 
            this.scene
        );
        this.camera.lowerBetaLimit = 0.6;
        this.camera.upperBetaLimit = 1.2;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        console.log('✅ [3D] Camera configured');
        
        // Set background color
        this.scene.clearColor = new Color4(0.04, 0.06, 0.10, 1);

        // Setup lighting
        this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        this.light.intensity = 0.85;
        console.log('✅ [3D] Lighting configured');

        // Build the game table and paddles
        this.rebuild();
        console.log('✅ [3D] Game objects created');

        // Create ball
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
        console.log('✅ [3D] Ball created');

        this.initialized = true;

        // Start render loop with error handling
        this.engine.runRenderLoop(() => {
            try {
                if (this.scene && !this.scene.isDisposed) {
                    this.syncFromGameState();
                    this.scene.render();
                }
            } catch (e) {
                console.error('[3D] Render loop error:', e);
                // Stop render loop on persistent errors
                this.engine.stopRenderLoop();
            }
        });
        console.log('✅ [3D] Render loop started');

        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.engine) {
                this.engine.resize();
            }
        });
        
        // Handle canvas container resize
        if (canvas.parentElement && 'ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                if (this.engine) {
                    this.engine.resize();
                }
            });
            ro.observe(canvas.parentElement);
        }
        
        console.log('✅ [3D] Scene initialization complete!');
        return this.scene;
    }

    private checkWebGLSupport(): boolean {
        console.log('🔍 [3D] Checking WebGL support...');
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            const supported = !!(window.WebGLRenderingContext && gl);
            console.log(supported ? '✅ [3D] WebGL is supported' : '❌ [3D] WebGL is NOT supported');
            return supported;
        } catch(e) {
            console.error('❌ [3D] WebGL check failed:', e);
            return false;
        }
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