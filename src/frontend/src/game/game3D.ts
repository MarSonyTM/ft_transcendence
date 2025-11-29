import { PongGame } from './PongGame';
import { GameState } from '../types';
import { Color3Gradient, CubeTexture, PBRMaterial } from "@babylonjs/core";
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

interface PaddleMeshes {
    left?: Mesh;
    right?: Mesh;
    top?: Mesh;
    bottom?: Mesh;
}

export class baby3D {
    private engine!: Engine;
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private light!: HemisphericLight;
    private table!: GroundMesh;
    private ball!: Mesh;
    private paddles: PaddleMeshes = {};
    private skybox!: AbstractMesh;
    private mode: string;
    private initialized: boolean = false;
    private lastBallX?: number;
    private lastBallY?: number;
    private hasBallState: boolean = false;

    private serverBallX: number = 200;
    private serverBallY: number = 200;
    private predictedBallX: number = 200;
    private predictedBallY: number = 200;
    private ballVelX: number = 0;
    private ballVelY: number = 0;
    private lastServerUpdateTime: number = performance.now();
    
    private targetPaddlePositions: { left?: number; top?: number; right?: number; bottom?: number } = {};
    private currentPaddlePositions: { left?: number; top?: number; right?: number; bottom?: number } = {};
    private lastUpdateTime: number = performance.now();
    private readonly SMOOTHING_FACTOR = 0.2;

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
        this.values = {
            min: 0,
            tableX: 400,
            tableY: this.mode === '4P' ? 400 : 200,
            paddleX: this.mode === '4P' ? 80 : 60,
            paddleY: 10,
            defaultPaddlePos: this.mode === '4P' ? 160 : 70,
            ballDiameter: 10,
            lift: 5
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
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
        
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'renderCanvas';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvas.style.touchAction = 'none';
            
            const gameContainer = document.getElementById('gameContainer') 
                || document.querySelector('.game-container')
                || document.body;
            
            gameContainer.appendChild(canvas);
        }
        
        try {
            this.engine = new Engine(canvas, true, { 
                preserveDrawingBuffer: true, 
                stencil: true,
                antialias: true,
                powerPreference: "high-performance"
            });
        } catch (error) {
        }
        
        // Create scene
        this.scene = new Scene(this.engine);
        this.engine.resize();
        this.setupCameraLight(canvas);

        // Build the game table and paddles
        this.rebuild();

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
        this.initialized = true;

        this.engine.runRenderLoop(() => {
            try {
                if (this.scene && !this.scene.isDisposed) {
                    this.syncFromGameState();
                    this.scene.render();
                }
            } catch (e) {
                console.error('[3D] Render loop error:', e);
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

    private setupCameraLight(canvas: HTMLCanvasElement) {
        this.camera = new ArcRotateCamera(
            'cam', 
            Math.PI / 2 + Math.PI, 
            0.95, 
            400, 
            new Vector3(0, 0, 0), 
            this.scene
        );
        this.camera.lowerBetaLimit = 0.6;
        this.camera.upperBetaLimit = 1.3;
        this.camera.attachControl(canvas, true);
        this.camera.inputs.attached.mousewheel.detachControl();

        this.createSkybox();

        this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        this.light.intensity = 0.85;
    }

    private rebuild() {
        this.table?.dispose();

        const is4P = this.mode === '4P';
        this.values.tableY = is4P ? 400 : 200;
        this.values.paddleX = is4P ? 80 : 60;
        this.values.defaultPaddlePos = is4P ? 160 : 70;

        const tableMat = new PBRMaterial('tableMat', this.scene);
        tableMat.metallic = 0.1;
        tableMat.roughness = 0;
        tableMat.subSurface.isTranslucencyEnabled = true;
        tableMat.subSurface.translucencyIntensity = 0.9;
        tableMat.alpha = 0.7;
        this.table = MeshBuilder.CreateGround('table', { width: this.values.tableX, height: this.values.tableY }, this.scene);
        this.table.position = new Vector3(0, 0, 0);
        this.table.material = tableMat;

        this.camera.radius = (this.mode === '4P') ? 600 : 400;

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