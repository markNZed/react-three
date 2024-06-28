import React, { useEffect, useMemo, useRef, useImperativeHandle, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Tube } from '@react-three/drei';
import CompoundEntityGroup from './CompoundEntityGroup';
import * as THREE from 'three';
import _ from 'lodash';
import * as utils from './utils';
import Particle from './Particle';
import ParticlesInstance from './ParticlesInstance';
import Blob from './Blob';
import Relations from './Relations';
import useAnimateRelations from './useAnimateRelations';
import useAnimateImpulses from './useAnimateImpulses';
import useAnimateJoints from './useAnimateJoints';
import useJoints from './useJoints';
import DebugRender from './DebugRender';
import useStoreEntity from './useStoreEntity';
import useStore from './../../useStore';
import useWhyDidYouUpdate from './useWhyDidYouUpdate';
import { useRapier, vec3, quat, RigidBody, BallCollider } from '@react-three/rapier';

const CompoundEntity = React.memo(React.forwardRef(({ id, initialPosition = [0, 0, 0], radius, debug, color, index, config }, ref) => {

    // Using forwardRef and need to access the ref from inside this component too
    const nodeRef = useRef();
    useImperativeHandle(ref, () => nodeRef.current);
    const { world, rapier } = useRapier();

    // Direct access to the state outside of React's render flow
    const { 
        getNode: directGetNode, 
        updateNode: directUpdateNode, 
        getAllParticleRefs: directGetAllParticleRefs,
        getJoint: directGetJoint,
    } = useStoreEntity.getState();
    const setOption = useStore((state) => state.setOption);
    const getOption = useStore((state) => state.getOption);

    // Select so we are only sensitive to changes of this node
    const { node, entityNodes } = useStoreEntity(useCallback((state) => {
        const node = state.nodes[id];
        const entityNodes = (node.childrenIds || []).map(childId => state.nodes[childId]);
        return { node, entityNodes };
      }, [id]));
    const isDebug = node.debug || debug || config.debug;
    const entityCount = node.childrenIds.length;
     // Store the color in a a state so it is consistent across renders (when defined by a function)
    const configColor = config.colors[node.depth];
    const localColor = useMemo(() => utils.getColor(configColor, color), [configColor, color]);    
    // The entity radius fills the perimeter of CompoundEntity with a margin to avoid overlap
    //const entityRadius = config.radius / getNodeCount();
    const entityRadius = config.radius / 10; // Fixed to help with testing
    //const entityRadius = useMemo(() => Math.min(radius * Math.PI / (entityCount + Math.PI), radius / 2) * 0.97, [radius, entityCount]);
    // Track the center of this CompoundEntity
    const centerRef = useRef(new THREE.Vector3());
    const worldCenterRef = useRef(new THREE.Vector3());
    // State machine that can distribute computation across frames
    const frameStateRef = useRef("init");
    const [physicsState, setPhysicsState] = useState("waiting");
    // A function to encapsulate the condition
    const isPhysicsReady = () => physicsState === "ready";
    const [entitiesInstantiated, setEntitiesInstantiated] = useState([]);
    // Block the instnatiating of next entity
    const busyInstantiatingRef = useRef(false);
    const instantiatingIdRef = useRef();
    const [instantiateJoints, setInstantiateJoints] = useState([]);
    const activeJointsQueueRef = useRef([]);
    const [replaceJointWith, setReplaceJointWith] = useState([]);
    const [entityInstantiated, setEntityInstantiated] = useState();
    const [particlesReady, setParticlesReady] = useState();
    const [innerCoreActive, setInnerCoreActive] = useState();
    const innerCoreRef = useRef();
    const [innerCoreRadius, setInnerCoreRadius] = useState();
    const innerCoreInitialPositionRef = useRef();
    const innerCoreChangeRef = useRef(1);

    // Layout to avoid Particle overlap (which can cause extreme forces in Rapier)
    //const entityPositions = useMemo(() => {
    //    return generateEntityPositions(radius - entityRadius, entityCount, initialPosition);
    //}, [radius, entityRadius, entityCount]);
    const entityPositionsRef = useRef([]);
    
    const {initializeJoints, deleteJoint, createJoint} = useJoints();

    //useAnimateImpulses(isPhysicsReady(), node, entityNodes, initialPosition, radius, config);
    useAnimateRelations(isPhysicsReady(), node, entityNodes, config);
    useAnimateJoints(isPhysicsReady(), node, entityNodes, deleteJoint, createJoint, config);

    useEffect(() => {
        directUpdateNode(id, {initialPosition});
        if (node.depth == 0) console.log(`Mounting CompoundEntity ${id} at depth ${node.depth}`);
        node.ref.current.setVisualConfig({ color: color, uniqueId: id, radius: radius });
    }, []);

    useEffect(() => {
        return;
        if (physicsState === "initialize") {
            node.ref.current.setVisualConfig({ color: color, uniqueId: id, radius: radius });
            const allParticleRefs = directGetAllParticleRefs(id);
            node.particlesRef.current = allParticleRefs;
            initializeJoints(node, entityPositions);
            setPhysicsState("ready");
            if (!getOption("pausePhysics")) setOption("pausePhysics", true);
        }
    }, [physicsState]);

    // Need particles[i].current.getVisualConfig().outerChain

    // This will cause a render on each change of entitiesInstantiated, adding one entity at a time
    useEffect(() => {
        console.log("useEffect", entityCount, busyInstantiatingRef.current);
        if (busyInstantiatingRef.current) return;
        for (let i = 0; i < entityNodes.length; i++) {
            const entityNodeId = entityNodes[i].id;
            if (entitiesInstantiated.includes(entityNodeId)) continue;
            busyInstantiatingRef.current = true;
            instantiatingIdRef.current = entityNodeId;
            setTimeout(() => {
                // Strip out any id from entitiesInstantiated that is not in entityNodes
                setEntitiesInstantiated(p => [...p.filter(id => node.childrenIds.includes(id)), entityNodeId]);
                // Not doing anything with i = 0 yet
                switch (i) {
                    case 0:
                        setInstantiateJoints(p => [...p, [null, null]]);
                        break;
                    case 1:
                        setInstantiateJoints(p => [...p, [entityNodes[0].id, entityNodes[1].id]]);
                        break;
                    case 2:
                        // Order is important, it must be clockwise
                        setInstantiateJoints(p => [...p, [entityNodes[1].id, entityNodes[2].id], [entityNodes[2].id, entityNodes[0].id]]);
                        break;
                    case 3:
                        const newPosition = true;
                        setReplaceJointWith(p => [...p, [entityNodes[i].id, newPosition]]);
                        break;
                    default:
                        setReplaceJointWith(p => [...p, [entityNodes[i].id, false]]);
                        break;
                }
            }, 1000); 
            
            // This is a hack for now as we should check that deeper levels are ready first
            // Probably just check if all children are ready (rather than all particles)
            if (physicsState !== "ready") {
                setPhysicsState("ready");
                console.log("setPhysicsState", physicsState, "to", "ready");
            }
            
            const newPosition = [...initialPosition];
            switch (i) {
                case 0: // point
                    break;
                case 1: // line
                    newPosition[0] += 2 * entityRadius;
                    break;
                case 2: // triangle
                    newPosition[0] += entityRadius;
                    newPosition[1] -= 2 * entityRadius; 
                    break;
                case 3: // diamond
                    // Here we can insert a virtual circle that "grows" to create a spherical blob
                    newPosition[0] += entityRadius;
                    newPosition[1] += 2 * entityRadius; 
                    break;
                default: {
                    // Should be the joint that is being replaced - first need to widen the joint
                    const replaceJointId = activeJointsQueueRef.current[0];
                    console.log("replaceJointId", replaceJointId, i, isDividedBy3APowerOf2(i));
                    if (isDividedBy3APowerOf2(i)) {

                        activeJointsQueueRef.current.forEach((jointId, i) => {
                            const [jointRef, body1Id, body2Id] = directGetJoint(jointId);
                            const joint = jointRef.current;
                            const scaleAnchor = (anchor) => ({
                                x: anchor.x * 2,
                                y: anchor.y * 2,
                                z: anchor.z * 2,
                            });
                            joint.setAnchor1(scaleAnchor(joint.anchor1()));
                            joint.setAnchor2(scaleAnchor(joint.anchor2()));
                        })

                    }
                    // Find the midpoint between the two nodes
                    // Need to wait for the joints to update first so the midpoint is up to date.
                    const [jointRef, body1Id, body2Id] = directGetJoint(replaceJointId);
                    const node1 = directGetNode(body1Id);
                    const node2 = directGetNode(body2Id);
                    const body1Ref = node1.ref.current;
                    const body2Ref = node2.ref.current;
                    // Create the particle in the middle and let the joints "pull" it into place.
                    const midpoint = utils.calculateMidpoint(body1Ref, body2Ref);
                    nodeRef.current.worldToLocal(midpoint);
                    newPosition[0] = midpoint.x;
                    newPosition[1] = midpoint.y;
                    newPosition[2] = midpoint.z;
                    break;
                }
            }
            entityPositionsRef.current.push(newPosition);
            console.log("Instantiating entityNodeId", id, i, entitiesInstantiated, entityNodeId, newPosition);
            break;
        }
    }, [entityInstantiated, entityNodes]);

    useFrame(() => {
        
        if (instantiateJoints.length || replaceJointWith.length) {
            calculateCenter({
                getNode: directGetNode,
                items: entitiesInstantiated,
                centerRef: worldCenterRef,
                useWorld: true,
            });
            const instantiatedJointsIndex = [];
            // Create a new joint connecting entities that are already connected
            instantiateJoints.forEach(([id1, id2], i) => {
                if (id1 === null && id2 === null) return; // special case for first entity (no join to create for now
                const node1 = directGetNode(id1); 
                const node2 = directGetNode(id2); 
                const body1Ref = node1.ref.current;
                const body2Ref = node2.ref.current;
                if (!body1Ref?.current || !body2Ref?.current) return;
                // Should deal with different radius
                const { offset1, offset2 } = utils.calculateJointOffsets(body1Ref, body2Ref, entityRadius);
                createJoint(body1Ref, offset1, body2Ref, offset2);
                activeJointsQueueRef.current.push(utils.jointId(node1.id, node2.id));
                instantiatedJointsIndex.push(i);   
            });
            setInstantiateJoints(p => p.filter((value, i) => !instantiatedJointsIndex.includes(i)));
            const processedJointIndices = [];
            // Replace a joint with a new entity and connect that entity
            replaceJointWith.forEach(([nextId, newPosition], i) => {
                const nextEntity = directGetNode(nextId); 
                const nextBodyRef = nextEntity.ref.current;
                if (!nextBodyRef?.current) return;
            
                const replaceJointId = activeJointsQueueRef.current[0];
            
                const [jointRef, body1Id, body2Id] = directGetJoint(replaceJointId);
                const anchor1 = vec3(jointRef.current.anchor1());
                const anchor2 = vec3(jointRef.current.anchor2());
            
                const node1 = directGetNode(body1Id); 
                const node2 = directGetNode(body2Id);
                const body1Ref = node1.ref.current;
                const body2Ref = node2.ref.current;
            
                applyNewJointPositions(newPosition, body1Ref, nextBodyRef, anchor1, anchor2, entityRadius);
                createJoint(body1Ref, anchor1, nextBodyRef, anchor2);
                activeJointsQueueRef.current.push(utils.jointId(node1.id, nextEntity.id));
            
                applyNewJointPositions(newPosition, nextBodyRef, body2Ref, anchor1, anchor2, entityRadius);
                createJoint(nextBodyRef, anchor1, body2Ref, anchor2);
                activeJointsQueueRef.current.push(utils.jointId(node2.id, nextEntity.id));
            
                deleteJoint(replaceJointId);
                activeJointsQueueRef.current.shift();
            
                processedJointIndices.push(i);
            });
            
            // Filter out indices that have already been processed
            setReplaceJointWith(p => p.filter((value, i) => !processedJointIndices.includes(i)));
            
            // If we have a shape then update the joints with new angles to allow for change in the number of entities
            if (entitiesInstantiated.length > 2) {
                calculateCenter({
                    getNode: directGetNode,
                    items: entitiesInstantiated,
                    centerRef: worldCenterRef,
                    useWorld: true,
                });
               
                // Calculate newJointAngle based on the sum of internal angles of a polygon, dividing it equally among vertices
                const sumInternal = (entitiesInstantiated.length - 2) * 180;
                const newJointAngle = sumInternal / entitiesInstantiated.length / 2;
                const axis = new THREE.Vector3(0, 0, 1); // Axis doesn't change, define once outside the loop
                const quaternion1 = new THREE.Quaternion();
                const quaternion2 = new THREE.Quaternion();
                // Because we use a clockwise direction for joints angle1 is positive, angle2 is negative
                const angle1 = THREE.MathUtils.degToRad(newJointAngle);
                const angle2 = THREE.MathUtils.degToRad(-newJointAngle);
                
                activeJointsQueueRef.current.forEach((jointId, i) => {
                    const [jointRef, body1Id, body2Id] = directGetJoint(jointId);
                    const joint = jointRef.current;
                
                    quaternion1.setFromAxisAngle(axis, angle1);
                    quaternion2.setFromAxisAngle(axis, angle2);
                
                    const anchor1 = joint.anchor1();
                    const anchor2 = joint.anchor2();
                    const radius1 = vec3(anchor1).length();
                    const radius2 = vec3(anchor2).length();
                
                    const newX1 = radius1 * Math.cos(angle1);
                    const newY1 = radius1 * Math.sin(angle1);
                    const newX2 = radius2 * Math.cos(angle2);
                    const newY2 = radius2 * Math.sin(angle2);
                
                    joint.setAnchor1(new THREE.Vector3(newX1, newY1, 0));
                    joint.setAnchor2(new THREE.Vector3(newX2, newY2, 0));
                });
                
                if (!innerCoreActive) {
                    // create innerCore
                    calculateCenter({
                        getNode: directGetNode,
                        items: entitiesInstantiated,
                        centerRef: centerRef,
                    });
                    innerCoreInitialPositionRef.current = centerRef.current;
                    setInnerCoreRadius(entityRadius / 3);
                    setInnerCoreActive(true);
                }

                // From here on we can increase the size of innerCore radius and extend a jint which is then replaced
            }
        }
        if (busyInstantiatingRef.current) {
            const lastEntity = directGetNode(instantiatingIdRef.current); 
            // Is the rigid body reference available
            if (lastEntity?.ref?.current?.current) {
                setEntityInstantiated(lastEntity.id);
                busyInstantiatingRef.current = false;
                //if (entitiesInstantiated.length == 1) {
                //    lastEntity.ref.current.current.lockRotations(true, true);
                //}
                if (entitiesInstantiated.length == entityCount) {
                    // This could be a property of the node
                    setParticlesReady(true);
                }
                node.particlesRef.current.push(lastEntity.ref);
            }
        }
    });

    useFrame(() => {
        if (innerCoreActive) {
            if (innerCoreRadius > entityRadius * 1.5) {
                innerCoreChangeRef.current = -1;
            }
            if (innerCoreRadius < entityRadius * 0.5 ) {
                innerCoreChangeRef.current = 1;
            }
            setInnerCoreRadius(innerCoreRadius + innerCoreChangeRef.current * entityRadius * 0.001);
        }
        return
        if (entityCount == 0) return;
        // State machine can distribute computation across frames, reducing load on the physics engine
        switch (frameStateRef.current) {
            case "init":
                // useEffect to call initializeJoints because it may take longer than a frame
                if (physicsState === "waiting") {
                    const allParticleRefs = directGetAllParticleRefs(id);
                    if (allParticleRefs.length) {
                        //console.log("allParticleRefs.length", id, allParticleRefs.length)
                        let particlesExist = true;
                        allParticleRefs.forEach((particleRef) => {
                            if (!particleRef.current) {
                                particlesExist = false;
                            }
                        });
                        if (particlesExist) setPhysicsState("initialize");
                    }
                }
                if (isPhysicsReady()) {
                    if (id == "root") {
                        console.log("Physics ready", nodeRef);
                        console.log("useStoreEntity", useStoreEntity.getState());
                        nodeRef.current.setVisualConfig(p => ({ ...p, visible: true }));
                    }
                    frameStateRef.current = "findCenter";
                }
                break;
            case "findCenter":
                calculateCenter({
                    items: entityNodes,
                    centerRef: centerRef,
                });
                nodeRef.current.setCenter(centerRef.current);
                break;
            default:
                console.error("Unexpected state", id, frameStateRef.current)
                break;
        }
    });

    //console.log("CompoundEntity rendering", id, "node", node, "entityCount", entityCount, "entityNodes", entityNodes)
    //useWhyDidYouUpdate(`CompoundEntity ${id}`, {id, initialPosition, radius, debug, color, index, config, node, entityNodes, entitiesInstantiated} );

    return (
        <group>
            <CompoundEntityGroup ref={nodeRef} position={initialPosition} >
                {entitiesInstantiated.map((entityId, i) => {
                    let entity = entityNodes[i];
                    let EntityType = (entity.childrenIds.length === 0) ? Particle : CompoundEntity;
                    return (
                        <EntityType
                            key={`${id}-${i}`}
                            id={`${entity.id}`}
                            initialPosition={entityPositionsRef.current[i]}
                            radius={entityRadius}
                            color={localColor}
                            ref={entity.ref}
                            debug={isDebug}
                            config={config}
                            index={`${i}`}
                        />
                    )
                })}

                {innerCoreActive && (
                    <RigidBody
                        ref={innerCoreRef}
                        position={innerCoreInitialPositionRef.current}
                        type={"dynamic"}
                        colliders={false}
                        enabledTranslations={[true, true, false]}
                        enabledRotations={[false, false, true]}
                    >
                        <BallCollider args={[innerCoreRadius]} />
                    </RigidBody>
                )}

                {physicsState === "ready" && (
                    <group>
                        {particlesReady && (
                            <Blob
                                color={localColor}
                                node={node}
                                centerRef={centerRef}
                                entityNodes={entityNodes}
                            />
                        )}
                        {node.depth === 0 && (
                            <group>
                                <ParticlesInstance
                                    id={`${id}`}
                                    node={node}
                                />
                                {config.showRelations && (
                                    <Relations 
                                        id={`${id}`} 
                                        node={node}
                                    />
                                )}
                            </group>
                        )}
                    </group>
                )}
                {isDebug && (
                    <DebugRender
                        id={id}
                        radius={radius}
                        color={localColor}
                        initialPosition={initialPosition}
                        newJointsRef={node.jointsRef}
                        index={index || 0}
                        nodeRef={nodeRef}
                        isDebug={isDebug}
                        centerRef={centerRef}
                    />
                )}
            </CompoundEntityGroup>
            {isDebug && (
                <Text
                    position={[initialPosition[0], initialPosition[1], 0.1]}
                    fontSize={radius / 2}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                >
                    {index || 0}
                </Text>
            )}  
        </group>
    );

}));

export default CompoundEntity;

// Function declarations outside the Component to reduce computation during rendering
// Distribute entities within the perimeter
const generateEntityPositions = (radius, count, initialPoint) => {
    const positions = [];
    const angleStep = (2 * Math.PI) / count;
    const initialAngle = Math.atan2(initialPoint[1], initialPoint[0]); // Calculate the angle of the initial point

    for (let i = 0; i < count; i++) {
        const angle = initialAngle + (i * angleStep);
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        positions.push(new THREE.Vector3(x, y, 0));
    }

    return positions;
}

const calculateCenter = ({getNode, items, centerRef, useWorld = false}) => {
    centerRef.current.set(0, 0, 0); // Reset the center vector
    let activeEntities = 0;
    
    items.forEach((item) => {
        let entityNode;

        // Check if the item is an ID or a node object and get the node accordingly
        if (typeof item === 'string' || typeof item === 'number') {
            entityNode = getNode(item);
        } else {
            entityNode = item;
        }

        // Continue if the entity node and its reference are valid
        if (entityNode && entityNode.ref.current) {
            // Decide whether to use world or local center based on the 'useWorld' flag
            const method = useWorld ? 'getCenterWorld' : 'getCenter';
            const entityCenter = entityNode.ref.current[method]();
            if (entityCenter) {
                centerRef.current.add(entityCenter);
                activeEntities++;
            }
        }
    });

    if (activeEntities > 0) {
        centerRef.current.divideScalar(activeEntities);
    }
};


function isDividedBy3APowerOf2(i) {
    if (i % 3 !== 0) return false;  // First, ensure i is divisible by 3
    let quotient = i / 3;
    return (quotient & (quotient - 1)) === 0;  // Check if quotient is a power of 2
}

function applyNewJointPositions(newPosition, bodyRef1, bodyRef2, anchor1, anchor2, radius) {
    if (newPosition) {
        const { offset1, offset2 } = utils.calculateJointOffsets(bodyRef1, bodyRef2, radius);
        Object.assign(anchor1, offset1);
        Object.assign(anchor2, offset2);

        const rotation1 = quat(bodyRef1.current.rotation());
        anchor1.applyQuaternion(rotation1);
        const rotation2 = quat(bodyRef2.current.rotation());
        anchor2.applyQuaternion(rotation2);
    } else {
        anchor1.multiplyScalar(0.5);
        anchor2.multiplyScalar(0.5);
    }
}
