import { PongGame } from './PongGame';
import { GameState } from '../types';
import { CubeTexture } from "@babylonjs/core";
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

interface PaddleMeshes {
    left?: Mesh;
    right?: Mesh;
    top?: Mesh;
    bottom?: Mesh;
}

// interface BorderMeshes {
//     north?: Mesh;
//     south?: Mesh;
//     east?: Mesh;
//     west?: Mesh;
// }

export class baby3D {
    private engine!: Engine;
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private light!: HemisphericLight;
    private table!: GroundMesh;
    private ball!: Mesh;
    // private borders: BorderMeshes = {};
    private paddles: PaddleMeshes = {};
    private skybox!: AbstractMesh;
    private mode: string;
    private initialized: boolean = false;
    private lastBallX?: number;
    private lastBallY?: number;
    // private halfX: number;
    // private halfY: number;
    private hasBallState: boolean = false;

    // Interpolation state for smooth movement
    // Ball: Use velocity-based prediction for constant speed (Pong physics)
    private serverBallX: number = 200;  // Authoritative position from server
    private serverBallY: number = 200;
    private predictedBallX: number = 200;  // Client-predicted position (for display)
    private predictedBallY: number = 200;
    private ballVelX: number = 0;
    private ballVelY: number = 0;
    private lastServerUpdateTime: number = performance.now();
    
    // Paddles: Use smooth interpolation (they move discretely)
    private targetPaddlePositions: { left?: number; top?: number; right?: number; bottom?: number } = {};
    private currentPaddlePositions: { left?: number; top?: number; right?: number; bottom?: number } = {};
    private lastUpdateTime: number = performance.now();
    private readonly SMOOTHING_FACTOR = 0.2; // For paddles only

    private values: {
        min: number,
        tableX: number,
        tableY: number,
        paddleX: number,
        paddleY: number,
        defaultPaddlePos: number,
        ballDiameter: number,
        lift: number
    }

    constructor(private game?: PongGame) {
        this.mode = (game?.gameState.mode === '4P') ? '4P' : '2P';
        // this.predictedBallX = 200;
        // this.predictedBallY = this.mode === '4P' ? 200 : 100;
        this.values = {
            min: 0,
            tableX: 400,
            tableY: this.mode === '4P' ? 400 : 200,
            paddleX: this.mode === '4P' ? 80 : 60,
            paddleY: 10,
            defaultPaddlePos: this.mode === '4P' ? 160 : 70,
            ballDiameter: 10,
            lift: 2
        };
        // this.halfX = this.values.tableX / 2;
        // this.halfY = this.values.tableY / 2;
        if (this.game) this.attachGame(this.game);
    }

    attachGame(game: PongGame) {
        this.game = game;
        this.game.addStateListener(() => {
            const mode = (this.game?.gameState?.mode === '4P') ? '4P' : '2P';
            if (this.initialized && mode !== this.mode) {
                this.mode = mode;
                this.rebuild();
                // this.setupTable();
                // this.setupBall();
                // this.setupPaddles();
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
        
        // Create babylonJS engine with error handling
        try {
            console.log('🎨 [3D] Creating babylonJS engine...');
            this.engine = new Engine(canvas, true, { 
                preserveDrawingBuffer: true, 
                stencil: true,
                antialias: true,
                powerPreference: "high-performance"
            });
            console.log('✅ [3D] Engine created successfully');
        } catch (error) {
            console.error('❌ [3D] Failed to create babylonJS engine:', error);
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

        this.createSkybox();

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
        this.ball = MeshBuilder.CreateSphere('ball', { diameter: this.values.ballDiameter }, this.scene);
        this.ball.position = new Vector3(
            this.table.position.x,
            this.values.lift,
            this.table.position.z
        );
        this.ball.material = ballMat;
        this.lastBallX = this.values.tableX / 2;
        this.lastBallY = this.values.tableY / 2;
        this.hasBallState = false;
        // Initialize ball state
        this.serverBallX = this.values.tableX / 2;
        this.serverBallY = this.values.tableY / 2;
        this.predictedBallX = this.values.tableX / 2;
        this.predictedBallY = this.values.tableY / 2;
        this.ballVelX = 0;
        this.ballVelY = 0;
        this.lastServerUpdateTime = performance.now();
        this.lastUpdateTime = performance.now();
        console.log('✅ [3D] Ball created');

        //TODO or: 
        // this.setupCameraLight(canvas);
        // this.mode = this.game?.gameState.mode === '4P' ? '4P' : '2P';
        // this.setupTable();
        // this.setupBall();
        // this.setupPaddles();
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
        
        return this.scene;
    }

    private checkWebGLSupport(): boolean {
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

    // private setupCameraLight(canvas: HTMLCanvasElement) {
    //     this.camera = new ArcRotateCamera(
    //         'cam', 
    //         Math.PI / 2 + Math.PI, 
    //         0.95, 
    //         350, 
    //         new Vector3(0, 0, 0), 
    //         this.scene
    //     );
    //     this.camera.lowerBetaLimit = 0.6;
    //     this.camera.upperBetaLimit = 1.3;
    //     this.camera.attachControl(canvas, true);

    //     this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
    //     this.light.intensity = 0.85;
    // }

    // private setupTable() {
    //     this.table?.dispose();
    //     Object.values(this.borders).forEach(m => m?.dispose());

    //     const is4P = this.mode === '4P';
    //     this.values.tableY = is4P ? 400 : 200;
    //     this.values.paddleX = is4P ? 80 : 60;
    //     this.values.defaultPaddlePos = is4P ? 160 : 70;
    //     this.halfX = this.values.tableX / 2;
    //     this.halfY = this.values.tableY / 2;

    //     const tableMat = new StandardMaterial('tableMat', this.scene);
    //     tableMat.diffuseColor = new Color3(0.05, 0.45, 0.1);
    //     const borderMat = new StandardMaterial('borderMat', this.scene);
    //     borderMat.transparencyMode = 0;
    //     this.table = MeshBuilder.CreateGround('table', { width: this.values.tableX, height: this.values.tableY }, this.scene);
    //     this.table.material = tableMat;

    //     const north = MeshBuilder.CreateBox('northBorder', { width: this.values.tableX, height: 1, depth: 0.3 }, this.scene);
    //     north.position = new Vector3(0, 0.1, this.halfY);
    //     north.material = borderMat;
    //     north.checkCollisions = true;

    //     const south = north.clone('southBorder');
    //     south.position.z = -this.halfY;

    //     const west = MeshBuilder.CreateBox('westBorder', { width: 0.3, height: 0.1, depth: this.values.tableY }, this.scene);
    //     west.position = new Vector3(-this.halfX, 0.1, 0);
    //     west.material = borderMat;
    //     west.checkCollisions = true;

    //     const east = west.clone('eastBorder');
    //     east.position.x = this.halfX;

    //     this.borders = { north, south, east, west };

    //     this.camera.radius = (this.mode === '4P') ? 600 : 350;
    // }

    // private setupBall() {
    //     this.ball?.dispose();

    //     const ballMat = new StandardMaterial('ballMat', this.scene);
    //     ballMat.diffuseColor = new Color3(1, 0.95, 0.4);
    //     this.ball = MeshBuilder.CreateSphere('ball', { diameter: this.values.ballDiameter }, this.scene);
    //     this.ball.position = new Vector3(0, this.values.lift, 0);
    //     this.ball.material = ballMat;
    //     this.ball.checkCollisions = true;
    //     // this.ball.onCollide(() => {});//TODO:MERGE add this
    //     this.lastBallX = this.predictedBallX = this.halfX;
    //     this.lastBallY = this.predictedBallY = this.halfY;
    //     this.ballVelX = this.ballVelY = 0;
    //     this.hasBallState = false;
    //     this.lastUpdateTime = performance.now();
    //     console.log('✅ [3D] Ball created');
    // }

    // private setupPaddles() {
    //     Object.values(this.paddles).forEach(m => m?.dispose());
    //     this.paddles = {};

    //     const makeMat = (name: string, color: Color3) => {
    //         const m = new StandardMaterial(name, this.scene);
    //         m.diffuseColor = color;
    //         return m;
    //     };

    //     const halfPad = this.values.paddleY / 2;

    //     if (this.mode === '2P') {
    //         const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
    //         left.position = new Vector3(-this.halfX + halfPad, this.values.lift, 0);
    //         left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1
    //         left.checkCollisions = true;

    //         const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
    //         right.position = new Vector3(this.halfX - halfPad, this.values.lift, 0);
    //         right.material = makeMat('mat_right', new Color3(0.2, 0.5, 1)); // Blue - Player 2
    //         right.checkCollisions = true;

    //         this.paddles = { left, right };
    //     } else {
    //         const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
    //         left.position = new Vector3(-this.halfX + halfPad, this.values.lift, 0);
    //         left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1
    //         left.checkCollisions = true;

    //         const top = MeshBuilder.CreateBox('paddle_top', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
    //         top.position = new Vector3(0, this.values.lift, this.halfY - halfPad);
    //         top.material = makeMat('mat_top', new Color3(0.2, 0.5, 1)); // Blue - Player 2
    //         top.checkCollisions = true;

    //         const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
    //         right.position = new Vector3(this.halfX - halfPad, this.values.lift, 0);
    //         right.material = makeMat('mat_right', new Color3(1, 1, 0.2)); // Yellow - Player 3
    //         right.checkCollisions = true;
            
    //         const bottom = MeshBuilder.CreateBox('paddle_bottom', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
    //         bottom.position = new Vector3(0, this.values.lift, -this.halfY + halfPad);
    //         bottom.material = makeMat('mat_bottom', new Color3(0.2, 1, 0.2)); // Green - Player 4
    //         bottom.checkCollisions = true;

    //         this.paddles = { left, top, right, bottom };
    //     }
    // }

    // private syncFromGameState() {
    //     if (!this.game) return;
    //     const state: GameState = this.game.gameState;
    //     if (!state) return;

    //     if (state.mode !== this.mode) {
    //         this.mode = state.mode;
    //         this.setupTable();
    //         this.setupBall();
    //         this.setupPaddles();
    //         this.currentPaddlePositions = {};
    //         this.targetPaddlePositions = {};
    //     }

    //     const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    //     // Helper function for linear interpolation (lerp)
    //     const lerp = (current: number, target: number, factor: number): number => {
    //         return current + (target - current) * factor;
    //     };

    //     // Calculate delta time for frame-rate independent interpolation
    //     const now = performance.now();
    //     const deltaTime = Math.min((now - this.lastUpdateTime) / 16.67, 2.0); // Cap at 2x normal frame time
    //     this.lastUpdateTime = now;
        
    //     // Adaptive smoothing factor based on delta time
    //     const smoothing = 1 - Math.pow(1 - this.SMOOTHING_FACTOR, deltaTime);

    //     if (this.ball) {
    //         //TODO:MERGE use collision and update Pos stuff
    //         const bxRaw = Number((state as any).ballPosX);
    //         const byRaw = Number((state as any).ballPosY);
    //         const velX = Number((state as any).ballVelX);
    //         const velY = Number((state as any).ballVelY);
    //         const validBx = Number.isFinite(bxRaw) && bxRaw >= this.values.min && bxRaw <= this.values.tableX;
    //         const validBy = Number.isFinite(byRaw) && byRaw >= this.values.min && byRaw <= this.values.tableY;
    //         const validVelX = Number.isFinite(velX);
    //         const validVelY = Number.isFinite(velY);

    //         // When we receive new server state, update authoritative position and velocity
    //         if (validBx && validBy) {
    //             this.predictedBallX = this.lastBallX = bxRaw;
    //             this.predictedBallY = this.lastBallY = byRaw;
    //             if (validVelX) this.ballVelX = velX;
    //             if (validVelY) this.ballVelY = velY;
    //             this.hasBallState = true;
    //         }

    //         // Initialize if not set
    //         if (!this.hasBallState) {
    //             this.predictedBallX = this.halfX;
    //             this.predictedBallY = this.halfY;
    //             this.ballVelX = this.ballVelY = 0;
    //         }

    //         // Client-side prediction: Continuously move ball by velocity each frame
    //         // This maintains constant speed (proper Pong physics)
    //         // deltaTime is normalized (1.0 = 16.67ms at 60fps), so multiply velocity by deltaTime
    //         this.predictedBallX += this.ballVelX * deltaTime;
    //         this.predictedBallY += this.ballVelY * deltaTime;

    //         // Use current predicted position
    //         const rx = validBx ? this.predictedBallX : (this.hasBallState ? (this.lastBallX as number) : this.halfX);
    //         const ry = validBy ? this.predictedBallY : (this.hasBallState ? (this.lastBallY as number) : this.halfY);

    //         this.ball.position = new Vector3(-this.halfX + rx, this.values.lift, this.halfY - ry);
    //     }

    //     const leftIdx = 0;
    //     const topIdx = this.mode === '4P' ? 1 : undefined;
    //     const rightIdx = this.mode === '2P' ? 1 : 2;
    //     const botIdx = this.mode === '4P' ? 3 : undefined;

    //     // Get target paddle positions from state
    //     const tl = state.players?.[leftIdx]?.pos ? state.players?.[leftIdx]!.pos : this.values.defaultPaddlePos;
    //     const tt = (topIdx !== undefined && state.players?.[topIdx]?.pos) ? state.players?.[topIdx]!.pos : this.values.defaultPaddlePos;
    //     const tr = state.players?.[rightIdx]?.pos ? state.players?.[rightIdx]!.pos : this.values.defaultPaddlePos;
    //     const tb = (botIdx !== undefined && state.players?.[botIdx]?.pos) ? state.players?.[botIdx]!.pos : this.values.defaultPaddlePos;
    //     const targetLeft = Number.isFinite(tl) ? tl : this.values.defaultPaddlePos;
    //     const targetTop = (topIdx !== undefined && Number.isFinite(tt)) ? tt : this.values.defaultPaddlePos;
    //     const targetRight = Number.isFinite(tr) ? tr : this.values.defaultPaddlePos;
    //     const targetBottom = (botIdx !== undefined && Number.isFinite(tb)) ? tb : this.values.defaultPaddlePos;

    //     // Update target positions
    //     this.targetPaddlePositions.left = targetLeft;
    //     if (topIdx !== undefined) this.targetPaddlePositions.top = targetTop;
    //     this.targetPaddlePositions.right = targetRight;
    //     if (botIdx !== undefined) this.targetPaddlePositions.bottom = targetBottom;

    //     // Initialize current positions if not set
    //     if (this.currentPaddlePositions.left === undefined) {
    //         this.currentPaddlePositions.left = this.values.defaultPaddlePos;
    //     }
    //     if (this.currentPaddlePositions.top === undefined && topIdx !== undefined) {
    //         this.currentPaddlePositions.top = this.values.defaultPaddlePos;
    //     }
    //     if (this.currentPaddlePositions.right === undefined) {
    //         this.currentPaddlePositions.right = this.values.defaultPaddlePos;
    //     }
    //     if (this.currentPaddlePositions.bottom === undefined && botIdx !== undefined) {
    //         this.currentPaddlePositions.bottom = this.values.defaultPaddlePos;
    //     }

    //     // Interpolate paddle positions smoothly (using same smoothing factor calculated above)
    //     this.currentPaddlePositions.left = lerp(this.currentPaddlePositions.left, targetLeft, smoothing);
    //     if (topIdx !== undefined) {
    //         this.currentPaddlePositions.top = lerp(this.currentPaddlePositions.top || this.values.defaultPaddlePos, targetTop, smoothing);
    //     }
    //     this.currentPaddlePositions.right = lerp(this.currentPaddlePositions.right, targetRight, smoothing);
    //     if (botIdx !== undefined) {
    //         this.currentPaddlePositions.bottom = lerp(this.currentPaddlePositions.bottom || this.values.defaultPaddlePos, targetBottom, smoothing);
    //     }

    //     const halfPaddleLen = this.values.paddleX / 2;
    //     const halfPaddleThick = this.values.paddleY / 2;
    //     const lrMinZ = -this.halfY + halfPaddleLen;
    //     const lrMaxZ = this.halfY - halfPaddleLen;
    //     const tbMinX = -this.halfX + halfPaddleLen;
    //     const tbMaxX = this.halfX - halfPaddleLen;

    //     if (this.paddles.left != undefined) {
    //         this.paddles.left.position.x = -this.halfX + halfPaddleThick;
    //         const centerZ = this.halfY - (this.currentPaddlePositions.left + halfPaddleLen);
    //         this.paddles.left.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
    //         this.paddles.left.position.y = this.values.lift;
    //     }
    //     if (this.paddles.top != undefined && topIdx !== undefined) {
    //         const centerX = -this.halfX + ((this.currentPaddlePositions.top || this.values.defaultPaddlePos) + halfPaddleLen);
    //         this.paddles.top.position.x = clamp(centerX, tbMinX, tbMaxX);
    //         this.paddles.top.position.z = this.halfY - halfPaddleThick;
    //         this.paddles.top.position.y = this.values.lift;
    //     }
    //     if (this.paddles.right != undefined) {
    //         this.paddles.right.position.x = this.halfX - halfPaddleThick;
    //         const centerZ = this.halfY - (this.currentPaddlePositions.right + halfPaddleLen);
    //         this.paddles.right.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
    //         this.paddles.right.position.y = this.values.lift;
    //     }
    //     if (this.paddles.bottom != undefined && botIdx !== undefined) {
    //         const centerX = -this.halfX + ((this.currentPaddlePositions.bottom || this.values.defaultPaddlePos) + halfPaddleLen);
    //         this.paddles.bottom.position.x = clamp(centerX, tbMinX, tbMaxX);
    //         this.paddles.bottom.position.z = -this.halfY + halfPaddleThick;
    //         this.paddles.bottom.position.y = this.values.lift;
    //     }

    //     if (this.skybox && this.camera) {
    //         this.skybox.position.copyFrom(this.camera.position);
    //     }
    // }

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
            // Reset ball state
            this.serverBallX = this.values.tableX / 2;
            this.serverBallY = this.values.tableY / 2;
            this.predictedBallX = this.values.tableX / 2;
            this.predictedBallY = this.values.tableY / 2;
            this.ballVelX = 0;
            this.ballVelY = 0;
            this.lastServerUpdateTime = performance.now();
            // Reset paddle interpolation state
            this.currentPaddlePositions = {};
            this.targetPaddlePositions = {};
        }

        const x = this.table.position.x;
        const z = this.table.position.z;

        const leftEdgeX = x - this.values.tableX / 2;
        const rightEdgeX = x + this.values.tableX / 2;
        const bottomEdgeZ = z - this.values.tableY / 2;
        const topEdgeZ = z + this.values.tableY / 2;

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

        // Helper function for linear interpolation (lerp)
        const lerp = (current: number, target: number, factor: number): number => {
            return current + (target - current) * factor;
        };

        // Calculate delta time for frame-rate independent interpolation
        const now = performance.now();
        const deltaTime = Math.min((now - this.lastUpdateTime) / 16.67, 2.0); // Cap at 2x normal frame time
        this.lastUpdateTime = now;
        
        // Adaptive smoothing factor based on delta time
        const smoothing = 1 - Math.pow(1 - this.SMOOTHING_FACTOR, deltaTime);

        if (this.ball) {
            const bxRaw = Number((state as any).ballPosX);
            const byRaw = Number((state as any).ballPosY);
            const velX = Number((state as any).ballVelX);
            const velY = Number((state as any).ballVelY);
            const maxX = this.values.tableX;
            const maxY = this.values.tableY;
            const validBx = Number.isFinite(bxRaw) && bxRaw >= 0 && bxRaw <= maxX;
            const validBy = Number.isFinite(byRaw) && byRaw >= 0 && byRaw <= maxY;
            const validVelX = Number.isFinite(velX);
            const validVelY = Number.isFinite(velY);

            // When we receive new server state, update authoritative position and velocity
            if (validBx && validBy) {
                const now = performance.now();
                
                // Update authoritative server position
                this.serverBallX = bxRaw;
                this.serverBallY = byRaw;
                
                // Reset predicted position to match server (start prediction from here)
                this.predictedBallX = bxRaw;
                this.predictedBallY = byRaw;
                
                // Always update velocity from server
                if (validVelX) this.ballVelX = velX;
                if (validVelY) this.ballVelY = velY;
                
                this.lastBallX = bxRaw;
                this.lastBallY = byRaw;
                this.lastServerUpdateTime = now;
                this.hasBallState = true;
            }

            // Initialize if not set
            if (!this.hasBallState) {
                this.serverBallX = maxX / 2;
                this.serverBallY = maxY / 2;
                this.predictedBallX = maxX / 2;
                this.predictedBallY = maxY / 2;
                this.ballVelX = 0;
                this.ballVelY = 0;
            }

            // Client-side prediction: Continuously move ball by velocity each frame
            // This maintains constant speed (proper Pong physics)
            // deltaTime is normalized (1.0 = 16.67ms at 60fps), so multiply velocity by deltaTime
            this.predictedBallX += this.ballVelX * deltaTime;
            this.predictedBallY += this.ballVelY * deltaTime;

            // Use current predicted position
            const rx = validBx ? this.predictedBallX : (this.hasBallState ? (this.lastBallX as number) : maxX / 2);
            const ry = validBy ? this.predictedBallY : (this.hasBallState ? (this.lastBallY as number) : maxY / 2);

            this.ball.position.x = leftEdgeX + rx;
            this.ball.position.z = topEdgeZ - ry;
            this.ball.position.y = this.values.lift;
        }

        const leftIdx = 0;
        const topIdx = this.mode === '4P' ? 1 : undefined;
        const rightIdx = this.mode === '2P' ? 1 : 2;
        const bottomIdx = this.mode === '4P' ? 3 : undefined;

        // Get target paddle positions from state
        const targetLeft = Number.isFinite(Number(state.players?.[leftIdx]?.pos))
            ? Number(state.players?.[leftIdx]!.pos)
            : this.values.defaultPaddlePos;
        const targetTop = (topIdx !== undefined && Number.isFinite(Number(state.players?.[topIdx]?.pos)))
            ? Number(state.players?.[topIdx]!.pos)
            : this.values.defaultPaddlePos;
        const targetRight = Number.isFinite(Number(state.players?.[rightIdx]?.pos))
            ? Number(state.players?.[rightIdx]!.pos)
            : this.values.defaultPaddlePos;
        const targetBottom = (bottomIdx !== undefined && Number.isFinite(Number(state.players?.[bottomIdx]?.pos)))
            ? Number(state.players?.[bottomIdx]!.pos)
            : this.values.defaultPaddlePos;

        // Update target positions
        this.targetPaddlePositions.left = targetLeft;
        if (topIdx !== undefined) this.targetPaddlePositions.top = targetTop;
        this.targetPaddlePositions.right = targetRight;
        if (bottomIdx !== undefined) this.targetPaddlePositions.bottom = targetBottom;

        // Initialize current positions if not set
        if (this.currentPaddlePositions.left === undefined) {
            this.currentPaddlePositions.left = this.values.defaultPaddlePos;
        }
        if (this.currentPaddlePositions.top === undefined && topIdx !== undefined) {
            this.currentPaddlePositions.top = this.values.defaultPaddlePos;
        }
        if (this.currentPaddlePositions.right === undefined) {
            this.currentPaddlePositions.right = this.values.defaultPaddlePos;
        }
        if (this.currentPaddlePositions.bottom === undefined && bottomIdx !== undefined) {
            this.currentPaddlePositions.bottom = this.values.defaultPaddlePos;
        }

        // Interpolate paddle positions smoothly (using same smoothing factor calculated above)
        this.currentPaddlePositions.left = lerp(this.currentPaddlePositions.left, targetLeft, smoothing);
        if (topIdx !== undefined) {
            this.currentPaddlePositions.top = lerp(this.currentPaddlePositions.top || this.values.defaultPaddlePos, targetTop, smoothing);
        }
        this.currentPaddlePositions.right = lerp(this.currentPaddlePositions.right, targetRight, smoothing);
        if (bottomIdx !== undefined) {
            this.currentPaddlePositions.bottom = lerp(this.currentPaddlePositions.bottom || this.values.defaultPaddlePos, targetBottom, smoothing);
        }

        const paddleLen = this.values.paddleX;
        const paddleThick = this.values.paddleY;
        const lrMinZ = bottomEdgeZ + paddleLen / 2;
        const lrMaxZ = topEdgeZ - paddleLen / 2;
        const tbMinX = leftEdgeX + paddleLen / 2;
        const tbMaxX = rightEdgeX - paddleLen / 2;

        if (this.paddles.left != undefined) {
            this.paddles.left.position.x = leftEdgeX + paddleThick / 2;
            const centerZ = topEdgeZ - (this.currentPaddlePositions.left + paddleLen / 2);
            this.paddles.left.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
            this.paddles.left.position.y = this.values.lift;
        }
        if (this.paddles.top != undefined && topIdx !== undefined) {
            const centerX = leftEdgeX + ((this.currentPaddlePositions.top || this.values.defaultPaddlePos) + paddleLen / 2);
            this.paddles.top.position.x = clamp(centerX, tbMinX, tbMaxX);
            this.paddles.top.position.z = topEdgeZ - paddleThick / 2;
            this.paddles.top.position.y = this.values.lift;
        }
        if (this.paddles.right != undefined) {
            this.paddles.right.position.x = rightEdgeX - paddleThick / 2;
            const centerZ = topEdgeZ - (this.currentPaddlePositions.right + paddleLen / 2);
            this.paddles.right.position.z = clamp(centerZ, lrMinZ, lrMaxZ);
            this.paddles.right.position.y = this.values.lift;
        }
        if (this.paddles.bottom != undefined && bottomIdx !== undefined) {
            const centerX = leftEdgeX + ((this.currentPaddlePositions.bottom || this.values.defaultPaddlePos) + paddleLen / 2);
            this.paddles.bottom.position.x = clamp(centerX, tbMinX, tbMaxX);
            this.paddles.bottom.position.z = bottomEdgeZ + paddleThick / 2;
            this.paddles.bottom.position.y = this.values.lift;
        }

        if (this.skybox && this.camera) {
            this.skybox.position.copyFrom(this.camera.position);
        }
    }

    private createSkybox(): void {
        
        const skybox = MeshBuilder.CreateBox(
            "skyBox", 
            { 
                size: 6000.0 
            }, 
            this.scene
        );
        const skyboxMaterial = new StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        
        const cubeTexture = CubeTexture.CreateFromImages(
            [
                "/assets/px.png",
                "/assets/py.png",
                "/assets/pz.png",
                "/assets/nx.png",
                "/assets/ny.png",
                "/assets/nz.png",
            ],
            this.scene
        );
        
        cubeTexture.onLoadObservable.add(() => {
            console.log('✅ [3D] Skybox textures loaded successfully!');
        });
        
        skyboxMaterial.reflectionTexture = cubeTexture;
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
        skyboxMaterial.specularColor = new Color3(0, 0, 0);
        skyboxMaterial.disableLighting = true;
        
        skybox.infiniteDistance = true;
        skybox.material = skyboxMaterial;

        this.skybox = skybox;
    }
}