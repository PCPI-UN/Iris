import { withoutOneofMarkers } from './grpc-oneof.util';

describe('withoutOneofMarkers', () => {
  it('drops the "_field": "field" markers at any depth and keeps real data', () => {
    expect(
      withoutOneofMarkers({
        items: [
          {
            id: 1,
            description: 'x',
            _description: 'description',
            participants: [{ _email: 'email', email: 'a@x.com' }],
          },
        ],
        _note: 'something else',
        when: new Date(0),
      }),
    ).toEqual({
      items: [
        { id: 1, description: 'x', participants: [{ email: 'a@x.com' }] },
      ],
      _note: 'something else',
      when: new Date(0),
    });
  });
});
