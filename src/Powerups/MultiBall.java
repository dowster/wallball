/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.Game;
import Game.PowerUp;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class MultiBall extends PowerUp 
{
   
   public MultiBall(Point location)
   {
      this.location = new Point(location);
      icon = MultiBall.class.getResource("/res/powerupImages/MultiBall.png");
   }

   @Override
   public void tick(Game game)
   {
      super.tick(game);   
   }

   @Override
   public void init(Game game)
   {
      game.addBall();
   }

   @Override
   public void end(Game game)
   {
   }

   @Override
   public void draw(Game game, Graphics w)
   {
      
   }

}
