// 测试文件用于验证 React 优化改进
import React, { useState, memo, useCallback } from 'react';

// 错误示例：由于内联对象属性而无法优化的组件
const BadComponent = memo(({ data }) => {
  return (
    <div>
      <h2>错误组件</h2>
      <ItemList items={data.items} onItemClick={(id) => console.log('已点击', id)} />
    </div>
  );
});

// 正确示例：使用记忆化回调优化的组件
const GoodComponent = memo(({ data }) => {
  const handleItemClick = useCallback((id) => {
    console.log('已点击', id);
  }, []);

  return (
    <div>
      <h2>正确组件</h2>
      <ItemList items={data.items} onItemClick={handleItemClick} />
    </div>
  );
});

// ItemList 组件用于渲染项目列表
const ItemList = memo(({ items, onItemClick }) => {
  console.log('ItemList 已渲染');
  return (
    <ul>
      {items.map(item => (
        <Item key={item.id} item={item} onClick={onItemClick} />
      ))}
    </ul>
  );
});

// Item 组件用于处理单个项目
const Item = memo(({ item, onClick }) => {
  console.log('Item 已渲染', item.id);
  return (
    <li onClick={() => onClick(item.id)}>
      {item.name}
    </li>
  );
});

// 主 App 组件
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
      <h1>React 优化测试</h1>
      <p>计数: {count}</p>
      <button onClick={() => setCount(count + 1)}>增加</button>
      <BadComponent data={data} />
      <GoodComponent data={data} />
    </div>
  );
};

export default App;