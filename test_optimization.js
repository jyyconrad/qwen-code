// Test file to verify React optimization improvements
import React, { useState, memo, useCallback } from 'react';

// Bad example: Component that can't be optimized due to inline object prop
const BadComponent = memo(({ data }) => {
  return (
    <div>
      <h2>Bad Component</h2>
      <ItemList items={data.items} onItemClick={(id) => console.log('Clicked', id)} />
    </div>
  );
});

// Good example: Optimized component with memoized callback
const GoodComponent = memo(({ data }) => {
  const handleItemClick = useCallback((id) => {
    console.log('Clicked', id);
  }, []);

  return (
    <div>
      <h2>Good Component</h2>
      <ItemList items={data.items} onItemClick={handleItemClick} />
    </div>
  );
});

// ItemList component that renders a list of items
const ItemList = memo(({ items, onItemClick }) => {
  console.log('ItemList rendered');
  return (
    <ul>
      {items.map(item => (
        <Item key={item.id} item={item} onClick={onItemClick} />
      ))}
    </ul>
  );
});

// Item component that handles individual items
const Item = memo(({ item, onClick }) => {
  console.log('Item rendered', item.id);
  return (
    <li onClick={() => onClick(item.id)}>
      {item.name}
    </li>
  );
});

// Main App component
const App = () => {
  const [data] = useState({
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
      { id: 3, name: 'Item 3' }
    ]
  });

  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>React Optimization Test</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <BadComponent data={data} />
      <GoodComponent data={data} />
    </div>
  );
};

export default App;