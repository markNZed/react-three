import React, { useRef, useEffect, useImperativeHandle, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import useAppStore from '../../useAppStore'
import { createParticleShaderOriginalGeometry,createParticleShaderOriginalMaterial} from './ParticleShaderOriginal'
import { createParticleShaderDiversityGeometry, createParticleShaderDiversityMaterial } from './ParticleShaderDiversity'

const SHADER_NONE = 0;
const SHADER_ORIG = 1;
const SHADER_DIVERSE = 2;
const USE_SHADER = SHADER_DIVERSE;

const ParticlesInstance = React.forwardRef(({ id, config }, ref) => {

    const internalRef = useRef();
    useImperativeHandle(ref, () => internalRef.current);

    const { getAllParticleRefs } = config.entityStore.getState();
    const userColor = new THREE.Color();
    const userScale = new THREE.Vector3();
    const currentPos = new THREE.Vector3();
    const currentScale = new THREE.Vector3();
    const currentQuaternion = new THREE.Quaternion();
    const currentColor = new THREE.Color();
    const invisibleScale = new THREE.Vector3(0.001, 0.001, 0.001);
    const instanceMatrix = new THREE.Matrix4();
    const [particleCount, setParticleCount] = useState(0);
    const showParticles = useAppStore((state) => state.getOption("showParticles"));
      
    /** @type {{ current: { circleMaterial: THREE.ShaderMaterial, circleGeometry: THREE.InstancedBufferGeometry } }} */
    const renderBlobRef = useRef();
    const timeRef = useRef(0);
    const pausePhysics = useAppStore((state) => state.pausePhysics);

    useEffect(() => {
        const allParticleRefs = getAllParticleRefs();
        const count = allParticleRefs.length;
        console.log("ParticlesInstance useEffect", id, count);

        switch (USE_SHADER) {
          case SHADER_NONE:
            break;
          case SHADER_ORIG:
            renderBlobRef.current = { };
            renderBlobRef.current.circleMaterial = createParticleShaderOriginalMaterial(1);
            renderBlobRef.current.circleGeometry = createParticleShaderOriginalGeometry(1, count, count*2);
            break;
          case SHADER_DIVERSE:
            renderBlobRef.current = { };
            renderBlobRef.current.circleMaterial = createParticleShaderDiversityMaterial(1);
            renderBlobRef.current.circleGeometry = createParticleShaderDiversityGeometry(1, 12, count, count*2)
            break;
        }
    }, []);

    useFrame((_, deltaTime) => {
        if (!internalRef.current) return;

        if (!pausePhysics) timeRef.current += deltaTime;
        //timeRef.current += deltaTime;

        const mesh = internalRef.current;
        let matrixChanged = false;
        let colorChanged = false;

        const allParticleRefs = getAllParticleRefs();
        const count = allParticleRefs.length;
        if (count !== particleCount) {
            setParticleCount(count);
        }
        
        if (renderBlobRef.current && (USE_SHADER === SHADER_ORIG || USE_SHADER === SHADER_DIVERSE)) {
            let { circleMaterial: circleInstanceMaterial, circleGeometry: circleInstanceGeometry } = renderBlobRef.current;

            circleInstanceMaterial.uniforms.time.value = timeRef.current;

            // If the number of particles is greater than our max instance count, recreate the geometry with particleCount*2 max instance count
            if (circleInstanceGeometry.userData.maxInstanceCount < particleCount) {
                renderBlobRef.current.circleGeometry = USE_SHADER === SHADER_ORIG ? 
                createParticleShaderOriginalGeometry(1, particleCount, particleCount*2) :
                createParticleShaderDiversityGeometry(1, 12, particleCount, particleCount*2);

                circleInstanceGeometry.dispose();
                circleInstanceGeometry = renderBlobRef.current.circleGeometry;
            }

            // If the instance count of our geometry is not equal to particleCount, set it
            if (circleInstanceGeometry.instanceCount !== particleCount) circleInstanceGeometry.instanceCount = particleCount;
            //if (circleInstanceMaterial.uniforms.radius.value !== particleRadius) { circleInstanceMaterial.uniforms.radius.value = particleRadius; }
            
            // If the InstancedMesh is not using our shader material and InstancedBufferGeometry, set it
            if (mesh.material !== circleInstanceMaterial) mesh.material = circleInstanceMaterial;
            if (mesh.geometry !== circleInstanceGeometry) mesh.geometry = circleInstanceGeometry;
        }

        //console.log("allParticleRefs", allParticleRefs)

        allParticleRefs.forEach((particleRef, i) => {
            
            const particle = particleRef.current;
            if (!particle || !particle.current) return;
        
            mesh.getMatrixAt(i, instanceMatrix);
            instanceMatrix.decompose(currentPos, currentQuaternion, currentScale);
 
            const physicsConfig = particle.getPhysicsConfig();

            const particlePos = particle.translation();
            let scale = physicsConfig.scale || 1;

            const RADIUS_MULT = USE_SHADER === SHADER_DIVERSE ? 0.85 : 1.0;
            const radius = physicsConfig.radius * RADIUS_MULT;
            const origRadius = physicsConfig.origRadius;
            //console.log("radius", i, radius, origRadius);
            if (radius !== origRadius) {
                scale = scale * (radius / origRadius);
            }

            // Default radius is 1
            if (radius !== 1) {
                scale = scale * (radius);
            }

            userScale.set(scale, scale, scale);

            const color = physicsConfig.color || 'red';
            userColor.set(color);

            if (!currentPos.equals(particlePos)) {
                currentPos.copy(particlePos);
                matrixChanged = true;
            }

            const visible = physicsConfig.visible || showParticles;
            if (!visible) {
                currentScale.copy(invisibleScale);
                matrixChanged = true;
            } else if (!currentScale.equals(userScale)) {
                currentScale.copy(userScale);
                matrixChanged = true;
            }

            if (matrixChanged) {
                instanceMatrix.compose(currentPos, currentQuaternion, currentScale);
                mesh.setMatrixAt(i, instanceMatrix);
            }

            if (mesh.instanceColor) {
                mesh.getColorAt(i, currentColor);
            
                // Tolerance because the conversion to floats causing mismatch
                const tolerance = 0.001;
                const diffR = Math.pow(currentColor.r - userColor.r, 2);
                const diffG = Math.pow(currentColor.g - userColor.g, 2);
                const diffB = Math.pow(currentColor.b - userColor.b, 2);

            
                const colorDifference = Math.sqrt(diffR + diffG + diffB);
            
                if (colorDifference > tolerance) {
                    mesh.setColorAt(i, userColor);
                    colorChanged = true;
                }
            } else {
                mesh.setColorAt(i, userColor);
                colorChanged = true;
            }

        });

        if (matrixChanged) {
            mesh.instanceMatrix.needsUpdate = true;
        }

        if (colorChanged) {
            mesh.instanceColor.needsUpdate = true;
        }
    });

    const handlePointerDown = (event) => {
        if (!event.shiftKey) return;
        const instanceId = event.instanceId;
        if (instanceId === undefined) return;
        event.stopPropagation();
        const allParticleRefs = getAllParticleRefs();
        const physicsConfig = allParticleRefs[instanceId].current.getPhysicsConfig();
        const currentScale = physicsConfig.scale;
        physicsConfig.scale = (currentScale && currentScale !== 1) ? 1.0 : 2.0;
        physicsConfig.color = 'pink';
        console.log("ParticlesInstance handlePointerDown", id, event, physicsConfig);
    };

    // Use a fixed radius and scale this for particle size
    return (
        <instancedMesh
            ref={internalRef}
            args={[null, null, particleCount]}
            onPointerUp={handlePointerDown}
        >
            <circleGeometry args={[1, 16]} />
            <meshStandardMaterial wireframe={false} side={THREE.FrontSide} />
        </instancedMesh>
    );
});

export default ParticlesInstance;