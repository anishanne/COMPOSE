<script>
	import { onMount, onDestroy } from "svelte";
	import { user } from "$lib/sessionStore";

	export let activeEditors = [];
	export let currentUserId = null;

	$: if ($user) {
		currentUserId = $user.id;
	}

	// Generate a color for each user based on their ID
	function getUserColor(userId) {
		if (!userId) return "#000000";
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = userId.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = hash % 360;
		return `hsl(${hue}, 70%, 50%)`;
	}

	function getUserDisplayName(editor) {
		return editor.users?.full_name || editor.users?.initials || editor.users?.email || "Unknown User";
	}

	$: otherEditors = (activeEditors || []).filter(
		(editor, index, arr) =>
			editor.user_id !== currentUserId &&
			arr.findIndex((e) => e.user_id === editor.user_id) === index
	);
	
	$: otherEditorsCount = otherEditors.length;
</script>

<div class="collaboration-widget">
	<div class="widget-header">
		<h4>Active Editors</h4>
		<span class="editor-count">{otherEditorsCount}</span>
	</div>
	
	{#if otherEditorsCount === 0}
		<p class="no-editors">No other editors</p>
	{:else}
		<ul class="editors-list">
			{#each otherEditors as editor}
				<li
					class="editor-item"
					style="--user-color: {getUserColor(editor.user_id)}"
				>
					<div 
						class="color-indicator"
						style="background-color: {getUserColor(editor.user_id)}"
					></div>
					<span class="editor-name">{getUserDisplayName(editor)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.collaboration-widget {
		background: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 12px;
		margin-bottom: 20px;
		min-width: 200px;
	}

	.widget-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid #ddd;
	}

	.widget-header h4 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #333;
	}

	.editor-count {
		background: #007bff;
		color: white;
		border-radius: 12px;
		padding: 2px 8px;
		font-size: 12px;
		font-weight: 600;
	}

	.no-editors {
		margin: 0;
		color: #666;
		font-size: 13px;
		text-align: center;
		padding: 8px 0;
	}

	.editors-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.editor-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		background: white;
		border-radius: 4px;
		border-left: 3px solid var(--user-color);
	}

	.color-indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.editor-name {
		font-size: 13px;
		color: #333;
	}
</style>

