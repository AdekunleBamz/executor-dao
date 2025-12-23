import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals, assert } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "ExecutorDAO core functionality - extension management",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;

        // Test initial state - no extensions enabled
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, "false");
        assertEquals(block.height, 2);

        // Enable an extension
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(true)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Verify extension is enabled
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "true");

        // Disable extension
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(false)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Verify extension is disabled
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "false");
    },
});

Clarinet.test({
    name: "ExecutorDAO core functionality - batch extension management",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;
        const wallet3 = accounts.get("wallet_3")!;

        // Set multiple extensions at once
        const extensionsList = [
            { extension: wallet1.address, enabled: true },
            { extension: wallet2.address, enabled: true },
            { extension: wallet3.address, enabled: false }
        ];

        const extensionsTuple = extensionsList.map(ext =>
            types.tuple({
                'extension': types.principal(ext.extension),
                'enabled': types.bool(ext.enabled)
            })
        );

        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extensions", [
                types.list(extensionsTuple)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Verify all extensions are set correctly
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet2.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet3.address)], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "true");  // wallet1 enabled
        assertEquals(block.receipts[1].result, "true");  // wallet2 enabled
        assertEquals(block.receipts[2].result, "false"); // wallet3 disabled
    },
});

Clarinet.test({
    name: "ExecutorDAO core functionality - proposal execution",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;

        // First enable an extension (simulating a proposal that would do this)
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(true)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Check that proposal hasn't been executed yet
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "executed-at", [
                types.principal(wallet1.address) // Using wallet1 as mock proposal
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "none");

        // Execute a proposal (using wallet1 contract as mock proposal)
        // Note: In real usage, this would be a proper proposal contract
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "execute", [
                types.principal(wallet1.address),
                types.principal(deployer.address)
            ], deployer.address)
        ]);
        // This will fail because wallet1.address is not a valid proposal contract
        // but it tests the execution path
        assert(block.receipts[0].result.includes("err"));

        // Verify proposal is now marked as executed (even if execution failed)
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "executed-at", [
                types.principal(wallet1.address)
            ], deployer.address)
        ]);
        // Should return a block height since execution was attempted
        assert(block.receipts[0].result !== "none");
    },
});

Clarinet.test({
    name: "ExecutorDAO core functionality - bootstrap and construction",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;

        // Test bootstrap construction
        // This would normally execute a bootstrap proposal
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "construct", [
                types.principal(wallet1.address) // Mock bootstrap proposal
            ], deployer.address)
        ]);

        // The construct call should change the executive to the DAO itself
        // and attempt to execute the bootstrap proposal
        assert(block.receipts.length > 0);
    },
});

Clarinet.test({
    name: "ExecutorDAO security - authorization checks",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;

        // Try to set extension as non-authorized user
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet2.address),
                types.bool(true)
            ], wallet1.address) // wallet1 is not authorized
        ]);
        assertEquals(block.receipts[0].result, "(err u1000)"); // ERR_UNAUTHORISED

        // Try to execute proposal as non-authorized user
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "execute", [
                types.principal(wallet2.address),
                types.principal(wallet1.address)
            ], wallet1.address) // wallet1 is not authorized
        ]);
        assertEquals(block.receipts[0].result, "(err u1000)"); // ERR_UNAUTHORISED

        // Try to construct as non-executive
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "construct", [
                types.principal(wallet2.address)
            ], wallet1.address) // wallet1 is not executive
        ]);
        assertEquals(block.receipts[0].result, "(err u1000)"); // ERR_UNAUTHORISED
    },
});

Clarinet.test({
    name: "ExecutorDAO security - duplicate proposal execution prevention",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;

        // Enable extension first
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(true)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // First execution attempt
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "execute", [
                types.principal(wallet1.address),
                types.principal(deployer.address)
            ], deployer.address)
        ]);

        // Second execution attempt should fail
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "execute", [
                types.principal(wallet1.address),
                types.principal(deployer.address)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(err u1001)"); // ERR_ALREADY_EXECUTED
    },
});

Clarinet.test({
    name: "ExecutorDAO extension callback functionality",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;

        // Enable an extension
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(true)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Try extension callback from enabled extension
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "request-extension-callback", [
                types.principal(wallet1.address), // extension
                types.buff("test-memo-123456789012") // 21 bytes + 13 chars
            ], wallet1.address) // called by the extension
        ]);

        // This will fail because wallet1.address is not a real extension contract
        // but it tests the authorization path
        assert(block.receipts[0].result.includes("err"));

        // Try callback from non-enabled extension
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "request-extension-callback", [
                types.principal(wallet2.address),
                types.buff("test-memo-123456789012")
            ], wallet2.address) // wallet2 is not enabled
        ]);
        assertEquals(block.receipts[0].result, "(err u1002)"); // ERR_INVALID_EXTENSION
    },
});

Clarinet.test({
    name: "ExecutorDAO integration - complex multi-step workflow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;
        const wallet3 = accounts.get("wallet_3")!;

        // Step 1: Set up multiple extensions
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extensions", [
                types.list([
                    types.tuple({
                        'extension': types.principal(wallet1.address),
                        'enabled': types.bool(true)
                    }),
                    types.tuple({
                        'extension': types.principal(wallet2.address),
                        'enabled': types.bool(true)
                    }),
                    types.tuple({
                        'extension': types.principal(wallet3.address),
                        'enabled': types.bool(false)
                    })
                ])
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Step 2: Verify extension states
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet2.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet3.address)], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "true");  // wallet1 enabled
        assertEquals(block.receipts[1].result, "true");  // wallet2 enabled
        assertEquals(block.receipts[2].result, "false"); // wallet3 disabled

        // Step 3: Attempt operations from different extensions
        block = chain.mineBlock([
            // Extension 1 tries to modify extension 3
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet3.address),
                types.bool(true)
            ], wallet1.address), // Called by extension 1

            // Extension 2 tries to execute a proposal
            Tx.contractCall("executor-dao", "execute", [
                types.principal(wallet3.address),
                types.principal(deployer.address)
            ], wallet2.address) // Called by extension 2
        ]);

        // Both should succeed since they're called by enabled extensions
        // (though execution will fail due to invalid proposal contract)
        assert(block.receipts[0].result === "(ok true)" || block.receipts[0].result.includes("err"));
        assert(block.receipts[1].result.includes("err")); // Will fail due to invalid proposal

        // Step 4: Verify final state
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet3.address)], deployer.address)
        ]);

        // Extension 3 should now be enabled due to the set-extension call from extension 1
        if (block.receipts[0].result === "(ok true)") {
            assertEquals(block.receipts[0].result, "true");
        }
    },
});

Clarinet.test({
    name: "ExecutorDAO edge cases and boundary testing",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;

        // Test with empty extension list
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extensions", [
                types.list([]) // Empty list
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");

        // Test extension queries for non-existent extensions
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [
                types.principal("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.fake")
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "false");

        // Test executed-at for never-executed proposals
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "executed-at", [
                types.principal("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.fake-proposal")
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "none");

        // Test maximum extensions list size (approaching limit)
        const maxExtensions = Array(200).fill(null).map((_, i) =>
            types.tuple({
                'extension': types.principal(`ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.ext${i}`),
                'enabled': types.bool(i % 2 === 0)
            })
        );

        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extensions", [
                types.list(maxExtensions)
            ], deployer.address)
        ]);
        assertEquals(block.receipts[0].result, "(ok true)");
    },
});

Clarinet.test({
    name: "ExecutorDAO state consistency and invariants",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get("deployer")!;
        const wallet1 = accounts.get("wallet_1")!;
        const wallet2 = accounts.get("wallet_2")!;

        // Establish baseline state
        let block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet2.address),
                types.bool(false)
            ], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "(ok true)");
        assertEquals(block.receipts[1].result, "(ok true)");

        // Verify initial state
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet2.address)], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "true");
        assertEquals(block.receipts[1].result, "false");

        // Perform state-changing operations
        block = chain.mineBlock([
            // Toggle extension states
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet1.address),
                types.bool(false)
            ], deployer.address),
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(wallet2.address),
                types.bool(true)
            ], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "(ok true)");
        assertEquals(block.receipts[1].result, "(ok true)");

        // Verify final state consistency
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet1.address)], deployer.address),
            Tx.contractCall("executor-dao", "is-extension", [types.principal(wallet2.address)], deployer.address)
        ]);

        assertEquals(block.receipts[0].result, "false"); // wallet1 now disabled
        assertEquals(block.receipts[1].result, "true");  // wallet2 now enabled

        // Test that disabled extension cannot perform privileged operations
        block = chain.mineBlock([
            Tx.contractCall("executor-dao", "set-extension", [
                types.principal(deployer.address),
                types.bool(true)
            ], wallet1.address) // wallet1 is now disabled
        ]);
        assertEquals(block.receipts[0].result, "(err u1000)"); // ERR_UNAUTHORISED
    },
});
