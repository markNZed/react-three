import { useEffect, useCallback, useRef } from 'react';

function useAnimateRelations(initialized, node, entityNodes, config) {

    const { getNode, getPropertyAllKeys, deleteRelation, addRelation, getRelationCount } = config.entityStore.getState();
    const entityCount = node.childrenIds.length;
    const maxDepth = getPropertyAllKeys('depth').length;
    const intervalRef = useRef(null);

    const handleRelations = useCallback(() => {
        const currentTotalRelations = getRelationCount();

        node.childrenIds.forEach((fromId, i) => {
            const fromNode = entityNodes[i];
            // Checking isParticle does not work because that is set from Particle after entityNodes is loaded
            // So we do not see the change. Could make isParticle a ref.
            if (entityNodes[i].childrenIds.length === 0 && Math.random() < 0.98) return;

            const maxRelationCount = Math.ceil(entityCount * 0.2);
            const nodeRelations = fromNode.relationsRef.current;
            let relationCount = nodeRelations.length || 0;

            // Randomly delete relations
            nodeRelations.forEach(toId => {
                if (Math.random() < 0.25) {
                    deleteRelation(fromId, toId);
                }
            });

            // After deleting some of the relations
            if (currentTotalRelations > config.maxRelations) return;

            relationCount = nodeRelations.length;

            while (relationCount < maxRelationCount) {
                let toId;
                let entityRefTo;
                if (Math.random() < 0.2) {
                    const maxDistanceUp = fromNode.depth;
                    let destinationNodeId = fromId;
                    let hopUp = 0;
                    let rollOfDice = Math.random();
                    if (rollOfDice < 0.8) {
                        hopUp = 0;
                    } else if (rollOfDice < 0.9 && maxDistanceUp) {
                        destinationNodeId = fromNode.parentId;
                        hopUp = 1;
                    } else if (maxDistanceUp > 1) {
                        const parentNode = getNode(fromNode.parentId);
                        destinationNodeId = parentNode.parentId;
                        hopUp = 2;
                    }
                    const destinationNode = getNode(destinationNodeId);
                    const maxDistanceDown = maxDepth - (destinationNode.depth);
                    let hopDown = 0;
                    rollOfDice = Math.random();
                    if (rollOfDice < 0.8) {
                        hopDown = 0;
                    } else if (rollOfDice < 0.9 && maxDistanceDown > 0) {
                        const randomIndex = Math.floor(Math.random() * destinationNode.childrenIds.length);
                        destinationNodeId = destinationNode.childrenIds[randomIndex];
                        hopDown = 1;
                    } else if (maxDistanceDown > 1) {
                        let randomIndex = Math.floor(Math.random() * destinationNode.childrenIds.length);
                        const childNode = getNode(destinationNode.childrenIds[randomIndex]);
                        if (childNode.childrenIds) {
                            randomIndex = Math.floor(Math.random() * childNode.childrenIds.length);
                            destinationNodeId = childNode.childrenIds[randomIndex];
                        } else {
                            destinationNodeId = childNode.id;
                        }
                        hopDown = 2;
                    }
                    const finalDestinationNode = getNode(destinationNodeId);
                    entityRefTo = finalDestinationNode.ref;
                    toId = destinationNodeId;
                } else {
                    // Preference is a relation with a sibling
                    let randomIndexTo = Math.floor(Math.random() * node.childrenIds.length);
                    toId = node.childrenIds[randomIndexTo];
                    entityRefTo = entityNodes[randomIndexTo];
                }

                // Avoid selecting the same entity for from and to
                if (fromId === toId) continue;

                addRelation(fromId, toId);
                relationCount++;
            }
        });
    }, [entityNodes, node.childrenIds, entityCount, maxDepth, config.maxRelations]);

    useEffect(() => {
        if (!config.showRelations || !initialized) return;

        const startInterval = () => {
            // Generate a random number between 500 and 5000 which determines the duration of relations
            const minDuration = 500;
            const maxDuration = 5000;
            const randomDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;

            intervalRef.current = setInterval(() => {
                handleRelations();
                clearInterval(intervalRef.current);
                startInterval(); // Restart the interval after it expires
            }, randomDuration);
        };

        startInterval();

        return () => {
            clearInterval(intervalRef.current); // Cleanup interval on component unmount
        };
    }, [config.showRelations, initialized]);

    return null;
}

export default useAnimateRelations;
